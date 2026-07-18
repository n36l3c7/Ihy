"""Tests for duplicate detection and broken-file cleanup."""

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.library import Track


def _clone_track(db: Session, original: Track, path: Path, bitrate: int) -> Track:
    path.write_bytes(b"duplicate-bytes")
    clone = Track(
        source_id=original.source_id,
        file_path=str(path),
        file_size=path.stat().st_size,
        file_mtime=0.0,
        format="flac",
        duration=original.duration,
        bitrate=bitrate,
        sample_rate=44100,
        title=original.title,
        artists=list(original.artists),
        album=original.album,
    )
    db.add(clone)
    db.commit()
    return clone


def test_duplicates_grouped_best_first(
    client: TestClient,
    admin_headers: dict,
    db_session: Session,
    seeded_library: SimpleNamespace,
) -> None:
    original = seeded_library.tracks[0]  # Ocean Song, 320 kbps
    _clone_track(db_session, original, seeded_library.root / "copy.flac", 900000)

    response = client.get("/api/v1/library/duplicates", headers=admin_headers)
    assert response.status_code == 200
    groups = response.json()
    assert len(groups) == 1
    titles = [track["title"] for track in groups[0]]
    assert titles == ["Ocean Song", "Ocean Song"]
    # Best copy (higher bitrate FLAC) first
    assert groups[0][0]["format"] == "flac"


def test_broken_report_and_cleanup(
    client: TestClient,
    admin_headers: dict,
    seeded_library: SimpleNamespace,
) -> None:
    victim = seeded_library.tracks[2]
    Path(victim.file_path).unlink()

    report = client.get("/api/v1/library/broken", headers=admin_headers).json()
    assert [track["title"] for track in report["broken"]] == ["River Jam"]
    assert report["offline_sources"] == []

    cleanup = client.post("/api/v1/library/broken/cleanup", headers=admin_headers)
    assert cleanup.json() == {"removed": 1}
    after = client.get("/api/v1/library/broken", headers=admin_headers).json()
    assert after["broken"] == []


def test_offline_source_not_flagged(
    client: TestClient,
    admin_headers: dict,
    db_session: Session,
    seeded_library: SimpleNamespace,
) -> None:
    # Simulate an unmounted share: the source path disappears entirely
    source = seeded_library.source
    source.path = str(seeded_library.root / "not-mounted")
    db_session.commit()

    report = client.get("/api/v1/library/broken", headers=admin_headers).json()
    assert report["broken"] == []
    assert [entry["name"] for entry in report["offline_sources"]] == ["lib"]
