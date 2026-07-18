import html
import re
from pathlib import Path
from urllib.parse import unquote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.library import Track
from app.models.playlist import Playlist
from app.models.user import User
from app.services import user_library

_LOCATION_RE = re.compile(r"<location>(.*?)</location>", re.S)


def parse_playlist_paths(content: str) -> list[str]:
    """Extract file paths from M3U/M3U8 or XSPF playlist content."""
    if content.lstrip().startswith("<"):
        paths = []
        for raw in _LOCATION_RE.findall(content):
            location = html.unescape(unquote(raw.strip()))
            if location.startswith("file://"):
                location = location[7:]
                # Windows drive letters arrive as /C:/... — drop the slash
                if re.match(r"^/[A-Za-z]:[/\\]", location):
                    location = location[1:]
            if location:
                paths.append(location)
        return paths
    return [
        line.strip()
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def _normalize(path: str) -> str:
    return path.replace("\\", "/").lower()


def _match_tracks(db: Session, paths: list[str]) -> list[Track | None]:
    """Match playlist entries to library tracks: exact path first,
    then by file name."""
    tracks = list(db.scalars(select(Track)))
    by_path = {_normalize(track.file_path): track for track in tracks}
    by_name: dict[str, Track] = {}
    for track in tracks:
        by_name.setdefault(Path(_normalize(track.file_path)).name, track)

    matched: list[Track | None] = []
    for raw in paths:
        track = by_path.get(_normalize(raw))
        if track is None:
            track = by_name.get(Path(_normalize(raw)).name)
        matched.append(track)
    return matched


def import_playlist(
    db: Session, user: User, *, name: str, content: str
) -> tuple[Playlist, int, int]:
    """Create a playlist from an M3U/XSPF file. Returns (playlist, matched, total)."""
    paths = parse_playlist_paths(content)
    matched = _match_tracks(db, paths)
    playlist = user_library.create_playlist(db, user, name=name)
    for track in matched:
        if track is not None:
            user_library.add_playlist_item(db, playlist, track)
    return playlist, sum(1 for track in matched if track is not None), len(paths)


def export_m3u(playlist: Playlist) -> str:
    """Render a playlist as extended M3U."""
    lines = ["#EXTM3U"]
    for item in playlist.items:
        track = item.track
        artists = ", ".join(artist.name for artist in track.artists) or "Unknown artist"
        lines.append(f"#EXTINF:{int(track.duration)},{artists} - {track.title}")
        lines.append(track.file_path)
    return "\n".join(lines) + "\n"
