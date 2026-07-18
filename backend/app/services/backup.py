import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.app_setting import AppSetting
from app.models.downloads import DownloadFix, DownloadWatch
from app.models.interactions import Favorite
from app.models.library import Source, Track
from app.models.playlist import Playlist, PlaylistItem
from app.models.user import User, UserRole

BACKUP_VERSION = 1
SECTIONS = ("settings", "sources", "users", "watches", "playlists")


def export_backup(db: Session, sections: list[str]) -> dict:
    data: dict = {
        "app": "ihy",
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "sections": {},
    }
    if "settings" in sections:
        rows = db.scalars(select(AppSetting))
        data["sections"]["settings"] = {row.key: json.loads(row.value) for row in rows}
    if "sources" in sections:
        data["sections"]["sources"] = [
            {"name": source.name, "path": source.path, "enabled": source.enabled}
            for source in db.scalars(select(Source))
        ]
    if "users" in sections:
        data["sections"]["users"] = [
            {
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "role": user.role.value,
                "is_active": user.is_active,
                "password_hash": user.password_hash,
            }
            for user in db.scalars(select(User))
        ]
    if "watches" in sections:
        watches = db.scalars(
            select(DownloadWatch).options(selectinload(DownloadWatch.source))
        )
        entries = []
        for watch in watches:
            fixes = db.scalars(
                select(DownloadFix).where(DownloadFix.watch_id == watch.id)
            )
            entries.append(
                {
                    "name": watch.name,
                    "query": watch.query,
                    "source_path": watch.source.path,
                    "enabled": watch.enabled,
                    "fixes": [
                        {
                            "song": fix.song,
                            "spotify_url": fix.spotify_url,
                            "youtube_url": fix.youtube_url,
                            "error": fix.error,
                        }
                        for fix in fixes
                    ],
                }
            )
        data["sections"]["watches"] = entries
    if "playlists" in sections:
        playlists = db.scalars(
            select(Playlist).options(
                selectinload(Playlist.owner),
                selectinload(Playlist.items).selectinload(PlaylistItem.track),
            )
        )
        data["sections"]["playlists"] = {
            "playlists": [
                {
                    "owner_username": playlist.owner.username,
                    "name": playlist.name,
                    "description": playlist.description,
                    "is_public": playlist.is_public,
                    "tracks": [item.track.file_path for item in playlist.items],
                }
                for playlist in playlists
            ],
            "favorites": [
                {
                    "username": user.username,
                    "file_paths": [
                        track.file_path
                        for track in db.scalars(
                            select(Track)
                            .join(Favorite, Favorite.track_id == Track.id)
                            .where(Favorite.user_id == user.id)
                        )
                    ],
                }
                for user in db.scalars(select(User))
            ],
        }
    return data


def _counts() -> dict:
    return {"created": 0, "updated": 0, "skipped": 0}


def import_backup(db: Session, data: dict, sections: list[str]) -> dict:
    """Merge a backup into the current database. Entities are matched on
    natural keys (path, username, name) — nothing is deleted."""
    stored = data.get("sections", {})
    summary: dict = {}

    if "settings" in sections and "settings" in stored:
        counts = _counts()
        for key, value in stored["settings"].items():
            existing = db.get(AppSetting, key)
            if existing is None:
                db.add(AppSetting(key=key, value=json.dumps(value)))
                counts["created"] += 1
            else:
                existing.value = json.dumps(value)
                counts["updated"] += 1
        db.commit()
        summary["settings"] = counts

    if "sources" in sections and "sources" in stored:
        counts = _counts()
        for entry in stored["sources"]:
            existing = db.scalar(select(Source).where(Source.path == entry["path"]))
            if existing is None:
                db.add(Source(**entry))
                counts["created"] += 1
            else:
                existing.name = entry["name"]
                existing.enabled = entry["enabled"]
                counts["updated"] += 1
        db.commit()
        summary["sources"] = counts

    if "users" in sections and "users" in stored:
        counts = _counts()
        for entry in stored["users"]:
            existing = db.scalar(select(User).where(User.username == entry["username"]))
            if existing is None:
                db.add(
                    User(
                        username=entry["username"],
                        first_name=entry.get("first_name"),
                        last_name=entry.get("last_name"),
                        email=entry.get("email"),
                        role=UserRole(entry.get("role", "user")),
                        is_active=entry.get("is_active", True),
                        password_hash=entry["password_hash"],
                    )
                )
                counts["created"] += 1
            else:
                # Existing accounts keep their password
                existing.first_name = entry.get("first_name")
                existing.last_name = entry.get("last_name")
                existing.email = entry.get("email")
                existing.role = UserRole(entry.get("role", existing.role.value))
                existing.is_active = entry.get("is_active", existing.is_active)
                counts["updated"] += 1
        db.commit()
        summary["users"] = counts

    if "watches" in sections and "watches" in stored:
        counts = _counts()
        for entry in stored["watches"]:
            source = db.scalar(select(Source).where(Source.path == entry["source_path"]))
            if source is None:
                counts["skipped"] += 1
                continue
            watch = db.scalar(
                select(DownloadWatch).where(
                    DownloadWatch.name == entry["name"],
                    DownloadWatch.query == entry["query"],
                )
            )
            if watch is None:
                watch = DownloadWatch(
                    name=entry["name"],
                    query=entry["query"],
                    source_id=source.id,
                    enabled=entry.get("enabled", True),
                )
                db.add(watch)
                db.flush()
                counts["created"] += 1
            else:
                watch.source_id = source.id
                watch.enabled = entry.get("enabled", watch.enabled)
                counts["updated"] += 1
            for fix_entry in entry.get("fixes", []):
                fix = db.scalar(
                    select(DownloadFix).where(
                        DownloadFix.watch_id == watch.id,
                        DownloadFix.song == fix_entry["song"],
                    )
                )
                if fix is None:
                    db.add(DownloadFix(watch_id=watch.id, **fix_entry))
                else:
                    fix.spotify_url = fix_entry.get("spotify_url")
                    fix.youtube_url = fix_entry.get("youtube_url")
        db.commit()
        summary["watches"] = counts

    if "playlists" in sections and "playlists" in stored:
        counts = _counts()
        track_by_path = {
            track.file_path: track.id for track in db.scalars(select(Track))
        }
        for entry in stored["playlists"].get("playlists", []):
            owner = db.scalar(
                select(User).where(User.username == entry["owner_username"])
            )
            if owner is None:
                counts["skipped"] += 1
                continue
            playlist = db.scalar(
                select(Playlist).where(
                    Playlist.owner_id == owner.id, Playlist.name == entry["name"]
                )
            )
            if playlist is None:
                playlist = Playlist(
                    owner_id=owner.id,
                    name=entry["name"],
                    description=entry.get("description"),
                    is_public=entry.get("is_public", False),
                )
                db.add(playlist)
                db.flush()
                counts["created"] += 1
            else:
                for item in list(playlist.items):
                    db.delete(item)
                db.flush()
                counts["updated"] += 1
            position = 1
            for file_path in entry.get("tracks", []):
                track_id = track_by_path.get(file_path)
                if track_id is None:
                    continue  # file not present in this library
                db.add(
                    PlaylistItem(
                        playlist_id=playlist.id, track_id=track_id, position=position
                    )
                )
                position += 1
        for entry in stored["playlists"].get("favorites", []):
            owner = db.scalar(select(User).where(User.username == entry["username"]))
            if owner is None:
                continue
            for file_path in entry.get("file_paths", []):
                track_id = track_by_path.get(file_path)
                if track_id is None:
                    continue
                if db.get(Favorite, (owner.id, track_id)) is None:
                    db.add(Favorite(user_id=owner.id, track_id=track_id))
        db.commit()
        summary["playlists"] = counts

    return summary
