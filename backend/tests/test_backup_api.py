from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import (
    DownloadFix,
    DownloadWatch,
    Favorite,
    Playlist,
    PlaylistItem,
    Source,
    Track,
    User,
)
from app.services import app_settings
from app.services.backup import export_backup, import_backup
from app.services.users import create as create_user

BACKUP_URL = "/api/v1/settings/backup"


def _seed_extras(db: Session, seeded: SimpleNamespace) -> None:
    app_settings.set_metadata_separators(db, [";", " feat. "])
    user = create_user(db, username="listener", password="listener-pass")
    playlist = Playlist(owner_id=user.id, name="Mix")
    playlist.items.append(PlaylistItem(track=seeded.tracks[0], position=1))
    playlist.items.append(PlaylistItem(track=seeded.tracks[2], position=2))
    db.add(playlist)
    db.add(Favorite(user_id=user.id, track_id=seeded.tracks[1].id))
    watch = DownloadWatch(name="W", query="spotify-url", source_id=seeded.source.id)
    db.add(watch)
    db.flush()
    db.add(DownloadFix(watch_id=watch.id, song="A - B", youtube_url="https://youtu.be/x"))
    db.commit()


def test_backup_roundtrip(
    db_session: Session, seeded_library: SimpleNamespace, tmp_path: Path
) -> None:
    _seed_extras(db_session, seeded_library)
    data = export_backup(db_session, ["settings", "sources", "users", "watches", "playlists"])
    assert data["app"] == "ihy"
    assert data["sections"]["settings"]["metadata_separators"] == [";", " feat. "]

    # Import into a fresh database that already has the same track files
    engine = create_engine(f"sqlite:///{tmp_path / 'restore.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as fresh:
        source = Source(name="other-name", path=seeded_library.source.path)
        fresh.add(source)
        fresh.commit()
        for track in seeded_library.tracks:
            fresh.add(
                Track(
                    source_id=source.id,
                    file_path=track.file_path,
                    file_size=1,
                    file_mtime=0.0,
                    format="mp3",
                    duration=1.0,
                    title=track.title,
                )
            )
        fresh.commit()

        summary = import_backup(
            fresh, data, ["settings", "sources", "users", "watches", "playlists"]
        )
        assert summary["users"]["created"] >= 1
        assert summary["sources"]["updated"] == 1

        assert app_settings.get_metadata_separators(fresh) == [";", " feat. "]
        restored_user = fresh.scalar(select(User).where(User.username == "listener"))
        assert restored_user is not None
        playlist = fresh.scalar(select(Playlist).where(Playlist.name == "Mix"))
        assert playlist is not None
        assert [item.track.title for item in playlist.items] == ["Ocean Song", "River Jam"]
        assert fresh.scalar(select(Favorite)) is not None
        watch = fresh.scalar(select(DownloadWatch).where(DownloadWatch.name == "W"))
        assert watch is not None
        fix = fresh.scalar(select(DownloadFix).where(DownloadFix.watch_id == watch.id))
        assert fix is not None
        assert fix.youtube_url == "https://youtu.be/x"
    engine.dispose()


def test_backup_endpoints(
    client: TestClient, admin_headers: dict[str, str], user_headers: dict[str, str]
) -> None:
    assert client.get(f"{BACKUP_URL}?sections=settings", headers=user_headers).status_code == 403
    assert client.get(f"{BACKUP_URL}?sections=bogus", headers=admin_headers).status_code == 400

    exported = client.get(f"{BACKUP_URL}?sections=settings", headers=admin_headers)
    assert exported.status_code == 200
    assert exported.json()["app"] == "ihy"

    bad = client.post(
        BACKUP_URL,
        json={"sections": ["settings"], "data": {"app": "other"}},
        headers=admin_headers,
    )
    assert bad.status_code == 400

    ok = client.post(
        BACKUP_URL,
        json={"sections": ["settings"], "data": exported.json()},
        headers=admin_headers,
    )
    assert ok.status_code == 200
