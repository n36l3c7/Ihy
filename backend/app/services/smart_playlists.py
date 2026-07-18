"""Rule engine for smart playlists.

A rule is {"field": ..., "op": ..., "value": ...}. Supported combinations:

- title/artist/album/genre/format: contains | is | is_not (string value)
- year/duration/play_count: eq | gte | lte (numeric value)
- added_days/played_days/not_played_days: lte-style windows (numeric value,
  "in the last N days"); not_played_days means NOT played in the window
- liked: is (boolean value)
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.interactions import Favorite, PlayHistory
from app.models.library import Album, Artist, Genre, Track
from app.models.smart_playlist import SmartPlaylist
from app.models.user import User

TEXT_FIELDS = {"title", "artist", "album", "genre", "format"}
NUMBER_FIELDS = {"year", "duration", "play_count"}
WINDOW_FIELDS = {"added_days", "played_days", "not_played_days"}
VALID_SORTS = {"title", "recent", "random", "most_played", "year"}


class InvalidRuleError(ValueError):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _text_condition(field: str, op: str, value: str) -> ColumnElement[bool]:
    column = {
        "title": Track.title,
        "format": Track.format,
    }.get(field)
    if column is not None:
        if op == "contains":
            return column.ilike(f"%{value}%")
        if op == "is":
            return func.lower(column) == value.lower()
        if op == "is_not":
            return func.lower(column) != value.lower()
        raise InvalidRuleError(f"Unsupported operator {op!r} for {field}")

    if field == "artist":
        inner = (
            Artist.name.ilike(f"%{value}%")
            if op == "contains"
            else func.lower(Artist.name) == value.lower()
        )
        condition = Track.artists.any(inner)
    elif field == "album":
        inner = (
            Album.title.ilike(f"%{value}%")
            if op == "contains"
            else func.lower(Album.title) == value.lower()
        )
        condition = Track.album.has(inner)
    elif field == "genre":
        inner = (
            Genre.name.ilike(f"%{value}%")
            if op == "contains"
            else func.lower(Genre.name) == value.lower()
        )
        condition = Track.genres.any(inner)
    else:
        raise InvalidRuleError(f"Unknown field {field!r}")
    if op == "is_not":
        return ~condition
    if op in {"contains", "is"}:
        return condition
    raise InvalidRuleError(f"Unsupported operator {op!r} for {field}")


def _play_count_subquery(user_id: int):
    return (
        select(func.count(PlayHistory.id))
        .where(PlayHistory.user_id == user_id, PlayHistory.track_id == Track.id)
        .correlate(Track)
        .scalar_subquery()
    )


def _number_condition(field: str, op: str, value: float, user_id: int) -> ColumnElement[bool]:
    column: Any
    if field == "year":
        column = Track.year
    elif field == "duration":
        column = Track.duration
    else:  # play_count
        column = _play_count_subquery(user_id)
    if op == "eq":
        return column == value
    if op == "gte":
        return column >= value
    if op == "lte":
        return column <= value
    raise InvalidRuleError(f"Unsupported operator {op!r} for {field}")


def _window_condition(field: str, value: float, user_id: int) -> ColumnElement[bool]:
    cutoff = _utcnow() - timedelta(days=float(value))
    if field == "added_days":
        return Track.created_at >= cutoff
    played_recently = exists().where(
        PlayHistory.user_id == user_id,
        PlayHistory.track_id == Track.id,
        PlayHistory.played_at >= cutoff,
    )
    return played_recently if field == "played_days" else ~played_recently


def rule_condition(rule: dict, user_id: int) -> ColumnElement[bool]:
    field = rule.get("field")
    op = rule.get("op", "is")
    value = rule.get("value")
    if field in TEXT_FIELDS:
        if not isinstance(value, str) or not value.strip():
            raise InvalidRuleError(f"{field} needs a text value")
        return _text_condition(field, op, value.strip())
    if field in NUMBER_FIELDS:
        try:
            number = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raise InvalidRuleError(f"{field} needs a numeric value") from None
        return _number_condition(field, op, number, user_id)
    if field in WINDOW_FIELDS:
        try:
            days = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raise InvalidRuleError(f"{field} needs a number of days") from None
        return _window_condition(field, days, user_id)
    if field == "liked":
        liked = exists().where(Favorite.user_id == user_id, Favorite.track_id == Track.id)
        truthy = value in (True, "true", "1", 1)
        return liked if truthy else ~liked
    raise InvalidRuleError(f"Unknown field {field!r}")


def validate_rules(raw: list[dict], user_id: int = 0) -> None:
    """Raise InvalidRuleError when any rule cannot be compiled."""
    for rule in raw:
        rule_condition(rule, user_id)


def resolve_tracks(db: Session, user: User, playlist: SmartPlaylist) -> list[Track]:
    rules: list[dict] = json.loads(playlist.rules)
    stmt: Select = select(Track)
    if rules:
        conditions = [rule_condition(rule, user.id) for rule in rules]
        stmt = stmt.where(and_(*conditions) if playlist.match == "all" else or_(*conditions))

    if playlist.sort == "recent":
        stmt = stmt.order_by(Track.created_at.desc(), Track.id)
    elif playlist.sort == "random":
        stmt = stmt.order_by(func.random())
    elif playlist.sort == "most_played":
        stmt = stmt.order_by(_play_count_subquery(user.id).desc(), Track.title)
    elif playlist.sort == "year":
        stmt = stmt.order_by(Track.year.desc().nulls_last(), Track.title)
    else:
        stmt = stmt.order_by(Track.title, Track.id)

    stmt = stmt.options(
        selectinload(Track.artists),
        selectinload(Track.album),
        selectinload(Track.genres),
    ).limit(playlist.max_tracks)
    return list(db.scalars(stmt))
