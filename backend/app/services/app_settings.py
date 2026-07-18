import json

from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting

METADATA_SEPARATORS_KEY = "metadata_separators"
DEFAULT_METADATA_SEPARATORS = ["/", ";"]

DOWNLOAD_INTERVAL_KEY = "download_check_interval_hours"
DEFAULT_DOWNLOAD_INTERVAL_HOURS = 24


def _get_raw(db: Session, key: str) -> str | None:
    setting = db.get(AppSetting, key)
    return setting.value if setting is not None else None


def _set_raw(db: Session, key: str, value: str) -> None:
    setting = db.get(AppSetting, key)
    if setting is None:
        db.add(AppSetting(key=key, value=value))
    else:
        setting.value = value
    db.commit()


def get_metadata_separators(db: Session) -> list[str]:
    """Separator strings used to split multi-value tags (artists, genres)."""
    raw = _get_raw(db, METADATA_SEPARATORS_KEY)
    if raw is None:
        return list(DEFAULT_METADATA_SEPARATORS)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return list(DEFAULT_METADATA_SEPARATORS)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return list(DEFAULT_METADATA_SEPARATORS)


def set_metadata_separators(db: Session, separators: list[str]) -> None:
    _set_raw(db, METADATA_SEPARATORS_KEY, json.dumps(separators))


def get_download_interval_hours(db: Session) -> int:
    """Hours between automatic spotdl watch checks. 0 disables the schedule."""
    raw = _get_raw(db, DOWNLOAD_INTERVAL_KEY)
    if raw is None:
        return DEFAULT_DOWNLOAD_INTERVAL_HOURS
    try:
        value = int(json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        return DEFAULT_DOWNLOAD_INTERVAL_HOURS
    return max(0, value)


def set_download_interval_hours(db: Session, hours: int) -> None:
    _set_raw(db, DOWNLOAD_INTERVAL_KEY, json.dumps(hours))
