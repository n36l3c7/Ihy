"""Scrobbling to ListenBrainz and Last.fm.

Submissions run in fire-and-forget threads so a slow or down service never
delays play recording.
"""

import hashlib
import logging
import threading
import time

import httpx
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.library import Track
from app.models.scrobble import ScrobbleConfig

logger = logging.getLogger(__name__)

LISTENBRAINZ_URL = "https://api.listenbrainz.org/1/submit-listens"
LASTFM_URL = "https://ws.audioscrobbler.com/2.0/"


class LastfmError(RuntimeError):
    pass


def _lastfm_signature(params: dict[str, str], secret: str) -> str:
    ordered = "".join(f"{key}{params[key]}" for key in sorted(params))
    return hashlib.md5((ordered + secret).encode("utf-8")).hexdigest()  # noqa: S324


def lastfm_get_session(
    api_key: str, api_secret: str, username: str, password: str
) -> str:
    """Exchange username+password for a permanent Last.fm session key."""
    params = {
        "method": "auth.getMobileSession",
        "api_key": api_key,
        "username": username,
        "password": password,
    }
    params["api_sig"] = _lastfm_signature(params, api_secret)
    response = httpx.post(LASTFM_URL, data={**params, "format": "json"}, timeout=15)
    payload = response.json()
    if "error" in payload:
        raise LastfmError(payload.get("message", "Last.fm authentication failed"))
    return payload["session"]["key"]


def _submit_listenbrainz(token: str, artist: str, title: str, album: str | None) -> None:
    body = {
        "listen_type": "single",
        "payload": [
            {
                "listened_at": int(time.time()),
                "track_metadata": {
                    "artist_name": artist,
                    "track_name": title,
                    **({"release_name": album} if album else {}),
                },
            }
        ],
    }
    response = httpx.post(
        LISTENBRAINZ_URL,
        json=body,
        headers={"Authorization": f"Token {token}"},
        timeout=15,
    )
    response.raise_for_status()


def _submit_lastfm(config: ScrobbleConfig, artist: str, title: str, album: str | None) -> None:
    if not (config.lastfm_api_key and config.lastfm_api_secret and config.lastfm_session_key):
        return
    params = {
        "method": "track.scrobble",
        "api_key": config.lastfm_api_key,
        "sk": config.lastfm_session_key,
        "artist": artist,
        "track": title,
        "timestamp": str(int(time.time())),
    }
    if album:
        params["album"] = album
    params["api_sig"] = _lastfm_signature(params, config.lastfm_api_secret)
    response = httpx.post(LASTFM_URL, data={**params, "format": "json"}, timeout=15)
    payload = response.json()
    if "error" in payload:
        raise LastfmError(payload.get("message", "Last.fm scrobble failed"))


def _scrobble_worker(user_id: int, track_id: int) -> None:
    try:
        with SessionLocal() as db:
            config = db.get(ScrobbleConfig, user_id)
            track = db.get(Track, track_id)
            if config is None or track is None:
                return
            artist = ", ".join(a.name for a in track.artists) or "Unknown Artist"
            title = track.title
            album = track.album.title if track.album else None
        if config.listenbrainz_token:
            try:
                _submit_listenbrainz(config.listenbrainz_token, artist, title, album)
            except Exception as exc:
                logger.warning("ListenBrainz scrobble failed: %s", exc)
        if config.lastfm_session_key:
            try:
                _submit_lastfm(config, artist, title, album)
            except Exception as exc:
                logger.warning("Last.fm scrobble failed: %s", exc)
    except Exception:
        logger.exception("Scrobble worker crashed")


def scrobble_async(user_id: int, track_id: int) -> None:
    """Submit a listen in the background; never blocks or raises."""
    threading.Thread(
        target=_scrobble_worker, args=(user_id, track_id), name="scrobble", daemon=True
    ).start()


def get_or_create_config(db: Session, user_id: int) -> ScrobbleConfig:
    config = db.get(ScrobbleConfig, user_id)
    if config is None:
        config = ScrobbleConfig(user_id=user_id)
        db.add(config)
        db.flush()
    return config
