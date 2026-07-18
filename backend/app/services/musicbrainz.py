"""MusicBrainz tag suggestions (a Picard-lite for the tag editor).

Recordings are searched by title and artist; covers come from the Cover
Art Archive. MusicBrainz requires a descriptive User-Agent and at most
one request per second.
"""

import threading
import time

import httpx

from app.core.config import get_settings

SEARCH_URL = "https://musicbrainz.org/ws/2/recording"
COVER_URL = "https://coverartarchive.org/release/{release_id}/front-500"

_last_request = 0.0
_rate_lock = threading.Lock()


def _user_agent() -> str:
    settings = get_settings()
    return f"Ihy/{settings.version} (https://github.com/n36l3c7/Ihy)"


def _throttle() -> None:
    global _last_request
    with _rate_lock:
        wait = 1.0 - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()


def search_recordings(title: str, artist: str | None, limit: int = 5) -> list[dict]:
    """Tag suggestions for a track: best MusicBrainz recording matches."""
    quoted = title.replace('"', " ")
    query = f'recording:"{quoted}"'
    if artist:
        query += f' AND artist:"{artist.replace(chr(34), " ")}"'
    _throttle()
    response = httpx.get(
        SEARCH_URL,
        params={"query": query, "fmt": "json", "limit": limit},
        headers={"User-Agent": _user_agent()},
        timeout=15,
    )
    response.raise_for_status()
    suggestions: list[dict] = []
    for recording in response.json().get("recordings", []):
        artists = [
            credit.get("name") or credit.get("artist", {}).get("name", "")
            for credit in recording.get("artist-credit", [])
            if isinstance(credit, dict)
        ]
        releases = recording.get("releases") or []
        release = releases[0] if releases else {}
        date = str(release.get("date") or "")
        year = int(date[:4]) if len(date) >= 4 and date[:4].isdigit() else None
        release_id = release.get("id")
        suggestions.append(
            {
                "title": recording.get("title", ""),
                "artists": [name for name in artists if name],
                "album": release.get("title"),
                "year": year,
                "score": recording.get("score", 0),
                "release_id": release_id,
                "cover_url": COVER_URL.format(release_id=release_id) if release_id else None,
            }
        )
    return suggestions


def fetch_cover(release_id: str) -> bytes:
    """Front cover bytes from the Cover Art Archive (raises on 404)."""
    _throttle()
    response = httpx.get(
        COVER_URL.format(release_id=release_id),
        headers={"User-Agent": _user_agent()},
        timeout=30,
        follow_redirects=True,
    )
    response.raise_for_status()
    if len(response.content) > 10 * 1024 * 1024:
        raise ValueError("Cover image too large")
    return response.content
