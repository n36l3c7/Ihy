from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.library import Source, Track


class InvalidSourcePathError(Exception):
    def __init__(self, path: str):
        super().__init__(f"Path does not exist or is not a directory: {path}")


class DuplicateSourcePathError(Exception):
    def __init__(self, path: str):
        super().__init__(f"A source with this path already exists: {path}")


def _normalize_path(raw: str) -> str:
    path = Path(raw).expanduser()
    if not path.is_dir():
        raise InvalidSourcePathError(raw)
    return str(path.resolve())


def get(db: Session, source_id: int) -> Source | None:
    return db.get(Source, source_id)


def list_with_counts(db: Session) -> list[tuple[Source, int]]:
    counts = dict(
        db.execute(select(Track.source_id, func.count()).group_by(Track.source_id)).all()
    )
    sources = db.scalars(select(Source).order_by(Source.id))
    return [(source, counts.get(source.id, 0)) for source in sources]


def track_count(db: Session, source: Source) -> int:
    return (
        db.scalar(select(func.count()).select_from(Track).where(Track.source_id == source.id)) or 0
    )


def create(db: Session, *, name: str, path: str) -> Source:
    normalized = _normalize_path(path)
    if db.scalar(select(Source).where(Source.path == normalized)) is not None:
        raise DuplicateSourcePathError(normalized)
    source = Source(name=name, path=normalized)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def update(db: Session, source: Source, changes: dict[str, Any]) -> Source:
    new_path = changes.get("path")
    if new_path is not None:
        normalized = _normalize_path(new_path)
        if normalized != source.path:
            if db.scalar(select(Source).where(Source.path == normalized)) is not None:
                raise DuplicateSourcePathError(normalized)
            source.path = normalized
    if changes.get("name") is not None:
        source.name = changes["name"]
    if changes.get("enabled") is not None:
        source.enabled = changes["enabled"]
    db.commit()
    db.refresh(source)
    return source


def delete(db: Session, source: Source) -> None:
    db.delete(source)
    db.commit()
