from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUserDep, DbDep
from app.services.scrobbler import LastfmError, get_or_create_config, lastfm_get_session

router = APIRouter()


class ScrobbleSettingsRead(BaseModel):
    listenbrainz_token: str | None
    lastfm_connected: bool
    lastfm_username: str | None


class ListenBrainzUpdate(BaseModel):
    token: str | None = Field(default=None, max_length=100)


class LastfmConnect(BaseModel):
    api_key: str = Field(min_length=1, max_length=64)
    api_secret: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


def _to_read(config) -> ScrobbleSettingsRead:
    return ScrobbleSettingsRead(
        listenbrainz_token=config.listenbrainz_token,
        lastfm_connected=config.lastfm_session_key is not None,
        lastfm_username=config.lastfm_username,
    )


@router.get("", response_model=ScrobbleSettingsRead)
def get_scrobble_settings(db: DbDep, user: CurrentUserDep) -> ScrobbleSettingsRead:
    config = get_or_create_config(db, user.id)
    db.commit()
    return _to_read(config)


@router.put("/listenbrainz", response_model=ScrobbleSettingsRead)
def set_listenbrainz_token(
    payload: ListenBrainzUpdate, db: DbDep, user: CurrentUserDep
) -> ScrobbleSettingsRead:
    config = get_or_create_config(db, user.id)
    config.listenbrainz_token = payload.token or None
    db.commit()
    return _to_read(config)


@router.post("/lastfm", response_model=ScrobbleSettingsRead)
def connect_lastfm(
    payload: LastfmConnect, db: DbDep, user: CurrentUserDep
) -> ScrobbleSettingsRead:
    """Exchange the password for a session key; the password is not stored."""
    try:
        session_key = lastfm_get_session(
            payload.api_key, payload.api_secret, payload.username, payload.password
        )
    except LastfmError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from None
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Last.fm"
        ) from None
    config = get_or_create_config(db, user.id)
    config.lastfm_api_key = payload.api_key
    config.lastfm_api_secret = payload.api_secret
    config.lastfm_session_key = session_key
    config.lastfm_username = payload.username
    db.commit()
    return _to_read(config)


@router.delete("/lastfm", response_model=ScrobbleSettingsRead)
def disconnect_lastfm(db: DbDep, user: CurrentUserDep) -> ScrobbleSettingsRead:
    config = get_or_create_config(db, user.id)
    config.lastfm_api_key = None
    config.lastfm_api_secret = None
    config.lastfm_session_key = None
    config.lastfm_username = None
    db.commit()
    return _to_read(config)
