"""OpenSubsonic-compatible API under /rest.

Lets mature mobile clients (Symfonium, Tempo, DSub, play:Sub, ...) use the
Ihy library: browsing by ID3 tags, search, streaming with optional
transcoding, cover art, playlists, favorites and scrobbling.

Authentication uses the per-user Subsonic secret (User.subsonic_token) shown
in the web app, via classic p= or salted t=+s= token auth.
"""

import hashlib
from collections import defaultdict
from pathlib import Path as FsPath
from xml.sax.saxutils import escape, quoteattr

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbDep
from app.core.config import get_settings
from app.models.artist_info import ArtistInfo
from app.models.interactions import Favorite, TrackRating
from app.models.library import Album, Artist, Genre, Track
from app.models.lyrics import Lyrics
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User
from app.services import artist_images, covers, transcoder, user_library
from app.services.scrobbler import scrobble_async

SUBSONIC_VERSION = "1.16.1"
SERVER_TYPE = "ihy"

router = APIRouter()

MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "m4a": "audio/mp4",
}


class SubsonicError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ---- Response envelope (JSON or XML depending on ?f=) ----


def _xml_serialize(name: str, data: object) -> str:
    if not isinstance(data, dict):
        return f"<{name}>{escape(str(data))}</{name}>"
    attributes: list[str] = []
    children: list[str] = []
    for key, value in data.items():
        if value is None:
            continue
        if key == "_text":
            children.append(escape(str(value)))
        elif isinstance(value, dict):
            children.append(_xml_serialize(key, value))
        elif isinstance(value, list):
            children.extend(_xml_serialize(key, item) for item in value)
        elif isinstance(value, bool):
            attributes.append(f"{key}={quoteattr('true' if value else 'false')}")
        else:
            attributes.append(f"{key}={quoteattr(str(value))}")
    head = f"<{name}{' ' if attributes else ''}{' '.join(attributes)}"
    if children:
        return f"{head}>{''.join(children)}</{name}>"
    return f"{head}/>"


def _strip_none(data: object) -> object:
    if isinstance(data, dict):
        return {key: _strip_none(value) for key, value in data.items() if value is not None}
    if isinstance(data, list):
        return [_strip_none(item) for item in data]
    return data


def subsonic_response(request: Request, payload: dict | None = None) -> Response:
    body: dict = {
        "status": "ok",
        "version": SUBSONIC_VERSION,
        "type": SERVER_TYPE,
        "serverVersion": get_settings().version,
        "openSubsonic": True,
    }
    if payload:
        body.update(payload)
    view = request.query_params.get("f", "xml")
    if view.startswith("json"):
        return JSONResponse({"subsonic-response": _strip_none(body)})
    xml = _xml_serialize("subsonic-response", {**body, "xmlns": "http://subsonic.org/restapi"})
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?>{xml}',
        media_type="application/xml",
    )


def subsonic_error_response(request: Request, code: int, message: str) -> Response:
    body = {
        "status": "failed",
        "version": SUBSONIC_VERSION,
        "type": SERVER_TYPE,
        "serverVersion": get_settings().version,
        "openSubsonic": True,
        "error": {"code": code, "message": message},
    }
    view = request.query_params.get("f", "xml")
    if view.startswith("json"):
        return JSONResponse({"subsonic-response": body})
    xml = _xml_serialize("subsonic-response", {**body, "xmlns": "http://subsonic.org/restapi"})
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?>{xml}',
        media_type="application/xml",
    )


async def subsonic_exception_handler(request: Request, exc: SubsonicError) -> Response:
    return subsonic_error_response(request, exc.code, exc.message)


# ---- Authentication ----


def authenticate(request: Request, db) -> User:
    params = request.query_params
    username = params.get("u")
    if not username:
        raise SubsonicError(10, "Required parameter 'u' is missing.")
    user = db.scalar(
        select(User).where(User.username == username, User.is_active.is_(True))
    )
    secret = user.subsonic_token if user else None
    if user is None or not secret:
        raise SubsonicError(40, "Wrong username or password.")

    password = params.get("p")
    token = params.get("t")
    salt = params.get("s")
    if password:
        if password.startswith("enc:"):
            try:
                password = bytes.fromhex(password[4:]).decode("utf-8")
            except ValueError:
                raise SubsonicError(40, "Wrong username or password.") from None
        if password == secret:
            return user
    elif token and salt:
        expected = hashlib.md5((secret + salt).encode("utf-8")).hexdigest()  # noqa: S324
        if token == expected:
            return user
    raise SubsonicError(40, "Wrong username or password.")


# ---- Serializers ----


def _parse_id(raw: str | None, prefix: str) -> int:
    if raw is None or not raw.startswith(f"{prefix}-"):
        raise SubsonicError(70, "The requested data was not found.")
    try:
        return int(raw.split("-", 1)[1])
    except ValueError:
        raise SubsonicError(70, "The requested data was not found.") from None


def _artist_entry(artist: Artist, album_count: int) -> dict:
    return {
        "id": f"ar-{artist.id}",
        "name": artist.name,
        "albumCount": album_count,
        "coverArt": f"ar-{artist.id}",
    }


def _album_entry(album: Album) -> dict:
    tracks = album.tracks
    return {
        "id": f"al-{album.id}",
        "name": album.title,
        "album": album.title,
        "title": album.title,
        "artist": album.artist.name if album.artist else "Unknown Artist",
        "artistId": f"ar-{album.artist.id}" if album.artist else None,
        "coverArt": f"al-{album.id}",
        "songCount": len(tracks),
        "duration": int(sum(track.duration for track in tracks)),
        "year": album.year,
        "created": album.created_at.isoformat() if album.created_at else None,
        "isDir": True,
    }


def _song_entry(track: Track) -> dict:
    artist_names = ", ".join(artist.name for artist in track.artists) or "Unknown Artist"
    first_artist = track.artists[0] if track.artists else None
    return {
        "id": f"tr-{track.id}",
        "parent": f"al-{track.album_id}" if track.album_id else None,
        "isDir": False,
        "title": track.title,
        "album": track.album.title if track.album else None,
        "albumId": f"al-{track.album_id}" if track.album_id else None,
        "artist": artist_names,
        "artistId": f"ar-{first_artist.id}" if first_artist else None,
        "track": track.track_number,
        "discNumber": track.disc_number,
        "year": track.year,
        "genre": track.genres[0].name if track.genres else None,
        "coverArt": f"al-{track.album_id}" if track.album_id else None,
        "size": track.file_size,
        "contentType": MEDIA_TYPES.get(track.format, "application/octet-stream"),
        "suffix": track.format,
        "duration": int(track.duration),
        "bitRate": int(track.bitrate / 1000) if track.bitrate else None,
        "path": track.file_path,
        "type": "music",
        "created": track.created_at.isoformat() if track.created_at else None,
    }


def _track_query():
    return select(Track).options(
        selectinload(Track.artists),
        selectinload(Track.album),
        selectinload(Track.genres),
    )


def _get_track(db, track_id: int) -> Track:
    track = db.scalar(_track_query().where(Track.id == track_id))
    if track is None:
        raise SubsonicError(70, "The requested data was not found.")
    return track


# ---- Endpoint registration helper: /rest/x and /rest/x.view ----


def sub_get(path: str):
    def wrap(fn):
        router.get(path)(fn)
        router.get(f"{path}.view")(fn)
        return fn

    return wrap


# ---- System ----


@sub_get("/ping")
def ping(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    return subsonic_response(request)


@sub_get("/getLicense")
def get_license(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    return subsonic_response(request, {"license": {"valid": True}})


@sub_get("/getOpenSubsonicExtensions")
def get_extensions(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    return subsonic_response(
        request,
        {"openSubsonicExtensions": [{"name": "songLyrics", "versions": [1]}]},
    )


@sub_get("/getUser")
def get_user(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    return subsonic_response(
        request,
        {
            "user": {
                "username": user.username,
                "email": user.email,
                "adminRole": user.role.value == "admin",
                "scrobblingEnabled": True,
                "downloadRole": True,
                "streamRole": True,
                "playlistRole": True,
                "coverArtRole": False,
                "settingsRole": False,
                "uploadRole": False,
                "shareRole": False,
                "jukeboxRole": False,
                "folder": [1],
            }
        },
    )


@sub_get("/getMusicFolders")
def get_music_folders(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    return subsonic_response(
        request, {"musicFolders": {"musicFolder": [{"id": 1, "name": "Music"}]}}
    )


# ---- Browsing (ID3) ----


@sub_get("/getArtists")
@sub_get("/getIndexes")
def get_artists(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    rows = db.execute(
        select(Artist, func.count(func.distinct(Album.id)))
        .outerjoin(Album, Album.artist_id == Artist.id)
        .group_by(Artist.id)
        .order_by(Artist.name)
    ).all()
    groups: dict[str, list[dict]] = defaultdict(list)
    for artist, album_count in rows:
        letter = artist.name[:1].upper()
        if not letter.isalpha():
            letter = "#"
        groups[letter].append(_artist_entry(artist, album_count))
    indexes = [{"name": letter, "artist": groups[letter]} for letter in sorted(groups)]
    key = "artists" if "getArtists" in request.url.path else "indexes"
    return subsonic_response(request, {key: {"ignoredArticles": "", "index": indexes}})


@sub_get("/getArtist")
def get_artist(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    artist_id = _parse_id(request.query_params.get("id"), "ar")
    artist = db.scalar(
        select(Artist)
        .where(Artist.id == artist_id)
        .options(selectinload(Artist.albums).selectinload(Album.tracks))
    )
    if artist is None:
        raise SubsonicError(70, "The requested data was not found.")
    entry = _artist_entry(artist, len(artist.albums))
    entry["album"] = [_album_entry(album) for album in artist.albums]
    return subsonic_response(request, {"artist": entry})


@sub_get("/getAlbum")
def get_album(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    album_id = _parse_id(request.query_params.get("id"), "al")
    album = db.scalar(
        select(Album)
        .where(Album.id == album_id)
        .options(
            selectinload(Album.artist),
            selectinload(Album.tracks).selectinload(Track.artists),
            selectinload(Album.tracks).selectinload(Track.genres),
            selectinload(Album.tracks).selectinload(Track.album),
        )
    )
    if album is None:
        raise SubsonicError(70, "The requested data was not found.")
    entry = _album_entry(album)
    entry["song"] = [_song_entry(track) for track in album.tracks]
    return subsonic_response(request, {"album": entry})


@sub_get("/getSong")
def get_song(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    track = _get_track(db, _parse_id(request.query_params.get("id"), "tr"))
    return subsonic_response(request, {"song": _song_entry(track)})


@sub_get("/getAlbumList2")
@sub_get("/getAlbumList")
def get_album_list2(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    params = request.query_params
    list_type = params.get("type", "alphabeticalByName")
    size = min(int(params.get("size", 10) or 10), 500)
    offset = int(params.get("offset", 0) or 0)
    stmt = select(Album).options(
        selectinload(Album.artist), selectinload(Album.tracks)
    )
    if list_type in {"newest", "recent"}:
        stmt = stmt.order_by(Album.created_at.desc())
    elif list_type in {"random", "frequent", "highest", "starred"}:
        stmt = stmt.order_by(func.random())
    elif list_type == "byYear":
        stmt = stmt.order_by(Album.year.desc().nulls_last(), Album.title)
    else:
        stmt = stmt.order_by(Album.title)
    albums = list(db.scalars(stmt.limit(size).offset(offset)))
    key = "albumList2" if "getAlbumList2" in request.url.path else "albumList"
    return subsonic_response(
        request, {key: {"album": [_album_entry(album) for album in albums]}}
    )


@sub_get("/getRandomSongs")
def get_random_songs(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    size = min(int(request.query_params.get("size", 10) or 10), 500)
    tracks = list(db.scalars(_track_query().order_by(func.random()).limit(size)))
    return subsonic_response(
        request, {"randomSongs": {"song": [_song_entry(track) for track in tracks]}}
    )


@sub_get("/getGenres")
def get_genres(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    rows = db.execute(
        select(Genre, func.count(Track.id))
        .outerjoin(Genre.tracks)
        .group_by(Genre.id)
        .order_by(Genre.name)
    ).all()
    return subsonic_response(
        request,
        {
            "genres": {
                "genre": [
                    {"_text": genre.name, "songCount": count, "albumCount": 0}
                    for genre, count in rows
                ]
            }
        },
    )


@sub_get("/getSongsByGenre")
def get_songs_by_genre(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    params = request.query_params
    genre_name = params.get("genre", "")
    count = min(int(params.get("count", 10) or 10), 500)
    offset = int(params.get("offset", 0) or 0)
    tracks = list(
        db.scalars(
            _track_query()
            .where(Track.genres.any(func.lower(Genre.name) == genre_name.lower()))
            .order_by(Track.title)
            .limit(count)
            .offset(offset)
        )
    )
    return subsonic_response(
        request, {"songsByGenre": {"song": [_song_entry(track) for track in tracks]}}
    )


@sub_get("/search3")
@sub_get("/search2")
def search3(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    params = request.query_params
    query = (params.get("query") or "").strip().strip('"')
    artist_count = min(int(params.get("artistCount", 20) or 20), 100)
    album_count = min(int(params.get("albumCount", 20) or 20), 100)
    song_count = min(int(params.get("songCount", 20) or 20), 100)
    pattern = f"%{query}%"

    artists_rows = db.execute(
        select(Artist, func.count(func.distinct(Album.id)))
        .outerjoin(Album, Album.artist_id == Artist.id)
        .where(Artist.name.ilike(pattern) if query else Artist.name.isnot(None))
        .group_by(Artist.id)
        .order_by(Artist.name)
        .limit(artist_count)
    ).all()
    albums = list(
        db.scalars(
            select(Album)
            .options(selectinload(Album.artist), selectinload(Album.tracks))
            .where(Album.title.ilike(pattern) if query else Album.title.isnot(None))
            .order_by(Album.title)
            .limit(album_count)
        )
    )
    tracks = list(
        db.scalars(
            _track_query()
            .where(
                or_(
                    Track.title.ilike(pattern),
                    Track.artists.any(Artist.name.ilike(pattern)),
                )
                if query
                else Track.title.isnot(None)
            )
            .order_by(Track.title)
            .limit(song_count)
        )
    )
    key = "searchResult3" if "search3" in request.url.path else "searchResult2"
    return subsonic_response(
        request,
        {
            key: {
                "artist": [_artist_entry(a, count) for a, count in artists_rows],
                "album": [_album_entry(album) for album in albums],
                "song": [_song_entry(track) for track in tracks],
            }
        },
    )


@sub_get("/getArtistInfo2")
@sub_get("/getArtistInfo")
def get_artist_info2(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    artist_id = _parse_id(request.query_params.get("id"), "ar")
    info = db.get(ArtistInfo, artist_id)
    key = "artistInfo2" if "getArtistInfo2" in request.url.path else "artistInfo"
    payload: dict = {}
    if info is not None and info.bio:
        payload["biography"] = {"_text": info.bio}
        if info.url:
            payload["lastFmUrl"] = info.url
    return subsonic_response(request, {key: payload})


# ---- Media ----


@sub_get("/stream")
def stream(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    track = _get_track(db, _parse_id(request.query_params.get("id"), "tr"))
    max_bitrate = int(request.query_params.get("maxBitRate", 0) or 0)
    wanted_format = request.query_params.get("format")
    if wanted_format != "raw" and (max_bitrate > 0 or wanted_format == "opus"):
        allowed = sorted(transcoder.ALLOWED_BITRATES)
        bitrate = max_bitrate if max_bitrate > 0 else 128
        chosen = max(
            (candidate for candidate in allowed if candidate <= bitrate), default=allowed[0]
        )
        try:
            cached = transcoder.transcoded_path(track, chosen)
            return FileResponse(cached, media_type="audio/ogg")
        except transcoder.TranscodeError:
            pass  # fall through to the original file
    path = FsPath(track.file_path)
    if not path.is_file():
        raise SubsonicError(70, "The requested data was not found.")
    return FileResponse(
        path, media_type=MEDIA_TYPES.get(track.format, "application/octet-stream")
    )


@sub_get("/download")
def download(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    track = _get_track(db, _parse_id(request.query_params.get("id"), "tr"))
    path = FsPath(track.file_path)
    if not path.is_file():
        raise SubsonicError(70, "The requested data was not found.")
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(track.format, "application/octet-stream"),
        filename=path.name,
    )


@sub_get("/getCoverArt")
def get_cover_art(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    raw = request.query_params.get("id") or ""
    image: FsPath | None = None
    if raw.startswith("al-"):
        album = db.get(Album, _parse_id(raw, "al"))
        if album is not None:
            image = covers.resolve_album_cover(db, album)
    elif raw.startswith("ar-"):
        artist = db.get(Artist, _parse_id(raw, "ar"))
        if artist is not None:
            image = artist_images.resolve_artist_image(artist)
    elif raw.startswith("tr-"):
        track = db.get(Track, _parse_id(raw, "tr"))
        if track is not None and track.album is not None:
            image = covers.resolve_album_cover(db, track.album)
    if image is None or not FsPath(image).is_file():
        raise SubsonicError(70, "The requested data was not found.")
    return FileResponse(image)


# ---- Lyrics ----


@sub_get("/getLyricsBySongId")
def get_lyrics_by_song_id(request: Request, db: DbDep) -> Response:
    authenticate(request, db)
    track_id = _parse_id(request.query_params.get("id"), "tr")
    track = _get_track(db, track_id)
    lyrics = db.get(Lyrics, track_id)
    structured: list[dict] = []
    if lyrics is not None and (lyrics.content or lyrics.synced_content):
        artist = track.artists[0].name if track.artists else None
        lines = [
            {"value": line}
            for line in (lyrics.content or lyrics.synced_content or "").splitlines()
            if line.strip()
        ]
        structured.append(
            {
                "displayArtist": artist,
                "displayTitle": track.title,
                "lang": "und",
                "synced": False,
                "line": lines,
            }
        )
    return subsonic_response(request, {"lyricsList": {"structuredLyrics": structured}})


# ---- Playlists ----


def _playlist_entry(playlist: Playlist) -> dict:
    tracks = [item.track for item in playlist.items]
    return {
        "id": f"pl-{playlist.id}",
        "name": playlist.name,
        "owner": playlist.owner.username if playlist.owner else None,
        "public": playlist.is_public,
        "songCount": len(tracks),
        "duration": int(sum(track.duration for track in tracks)),
        "created": playlist.created_at.isoformat() if playlist.created_at else None,
        "changed": playlist.updated_at.isoformat() if playlist.updated_at else None,
    }


def _get_owned_playlist(db, user: User, raw_id: str | None) -> Playlist:
    playlist = db.scalar(
        select(Playlist)
        .where(Playlist.id == _parse_id(raw_id, "pl"), Playlist.owner_id == user.id)
        .options(
            selectinload(Playlist.owner),
            selectinload(Playlist.items).selectinload(PlaylistItem.track),
        )
    )
    if playlist is None:
        raise SubsonicError(70, "The requested data was not found.")
    return playlist


@sub_get("/getPlaylists")
def get_playlists(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    playlists = list(
        db.scalars(
            select(Playlist)
            .where(Playlist.owner_id == user.id)
            .options(
                selectinload(Playlist.owner),
                selectinload(Playlist.items).selectinload(PlaylistItem.track),
            )
            .order_by(Playlist.name)
        )
    )
    return subsonic_response(
        request, {"playlists": {"playlist": [_playlist_entry(item) for item in playlists]}}
    )


@sub_get("/getPlaylist")
def get_playlist(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    playlist = _get_owned_playlist(db, user, request.query_params.get("id"))
    entry = _playlist_entry(playlist)
    entry["entry"] = [_song_entry(item.track) for item in playlist.items]
    return subsonic_response(request, {"playlist": entry})


@sub_get("/createPlaylist")
def create_playlist(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    name = request.query_params.get("name")
    if not name:
        raise SubsonicError(10, "Required parameter 'name' is missing.")
    playlist = user_library.create_playlist(db, user, name=name)
    for raw in request.query_params.getlist("songId"):
        track = db.get(Track, _parse_id(raw, "tr"))
        if track is not None:
            user_library.add_playlist_item(db, playlist, track)
    db.commit()
    refreshed = _get_owned_playlist(db, user, f"pl-{playlist.id}")
    entry = _playlist_entry(refreshed)
    entry["entry"] = [_song_entry(item.track) for item in refreshed.items]
    return subsonic_response(request, {"playlist": entry})


@sub_get("/updatePlaylist")
def update_playlist(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    playlist = _get_owned_playlist(db, user, request.query_params.get("playlistId"))
    name = request.query_params.get("name")
    if name:
        playlist.name = name
    for raw in request.query_params.getlist("songIdToAdd"):
        track = db.get(Track, _parse_id(raw, "tr"))
        if track is not None:
            user_library.add_playlist_item(db, playlist, track)
    indexes = sorted(
        (int(i) for i in request.query_params.getlist("songIndexToRemove")), reverse=True
    )
    for index in indexes:
        if 0 <= index < len(playlist.items):
            db.delete(playlist.items[index])
    db.commit()
    return subsonic_response(request)


@sub_get("/deletePlaylist")
def delete_playlist(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    playlist = _get_owned_playlist(db, user, request.query_params.get("id"))
    db.delete(playlist)
    db.commit()
    return subsonic_response(request)


# ---- Favorites and scrobbling ----


@sub_get("/star")
def star(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    for raw in request.query_params.getlist("id"):
        if raw.startswith("tr-"):
            track = db.get(Track, _parse_id(raw, "tr"))
            if track is not None:
                user_library.add_favorite(db, user, track)
    db.commit()
    return subsonic_response(request)


@sub_get("/unstar")
def unstar(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    for raw in request.query_params.getlist("id"):
        if raw.startswith("tr-"):
            user_library.remove_favorite(db, user, _parse_id(raw, "tr"))
    db.commit()
    return subsonic_response(request)


@sub_get("/getStarred2")
@sub_get("/getStarred")
def get_starred2(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    tracks = list(
        db.scalars(
            _track_query()
            .join(Favorite, Favorite.track_id == Track.id)
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc())
        )
    )
    key = "starred2" if "getStarred2" in request.url.path else "starred"
    return subsonic_response(
        request,
        {key: {"artist": [], "album": [], "song": [_song_entry(track) for track in tracks]}},
    )


@sub_get("/setRating")
def set_rating(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    raw = request.query_params.get("id")
    if raw is None or not raw.startswith("tr-"):
        return subsonic_response(request)  # album/artist ratings are ignored
    track_id = _parse_id(raw, "tr")
    if db.get(Track, track_id) is None:
        raise SubsonicError(70, "The requested data was not found.")
    try:
        rating = max(0, min(5, int(request.query_params.get("rating", 0))))
    except ValueError:
        raise SubsonicError(10, "rating must be an integer 0-5.") from None
    existing = db.get(TrackRating, (user.id, track_id))
    if rating == 0:
        if existing is not None:
            db.delete(existing)
    elif existing is not None:
        existing.rating = rating
    else:
        db.add(TrackRating(user_id=user.id, track_id=track_id, rating=rating))
    db.commit()
    return subsonic_response(request)


@sub_get("/scrobble")
def scrobble(request: Request, db: DbDep) -> Response:
    user = authenticate(request, db)
    submission = request.query_params.get("submission", "true").lower() != "false"
    if submission:
        for raw in request.query_params.getlist("id"):
            track = db.get(Track, _parse_id(raw, "tr"))
            if track is not None:
                user_library.record_play(db, user, track)
                scrobble_async(user.id, track.id)
    return subsonic_response(request)
