import html
import logging
import re
import time

import httpx

logger = logging.getLogger(__name__)

TOKEN_URL = "https://accounts.spotify.com/api/token"
SEARCH_URL = "https://api.spotify.com/v1/search"

_OG_TITLE_RE = re.compile(r'<meta property="og:title" content="([^"]+)"')
_OG_DESC_RE = re.compile(r'<meta property="og:description" content="([^"]+)"')

_token_cache: dict = {"client_id": None, "token": None, "expires_at": 0.0}


class SpotifyError(Exception):
    pass


def _get_token(client_id: str, client_secret: str) -> str:
    now = time.monotonic()
    if _token_cache["client_id"] == client_id and _token_cache["expires_at"] > now:
        return _token_cache["token"]
    try:
        response = httpx.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(client_id, client_secret),
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise SpotifyError(f"Spotify authentication request failed: {exc}") from exc
    if response.status_code != 200:
        raise SpotifyError("Spotify authentication failed — check the client id and secret")
    payload = response.json()
    _token_cache.update(
        {
            "client_id": client_id,
            "token": payload["access_token"],
            "expires_at": now + payload.get("expires_in", 3600) - 60,
        }
    )
    return _token_cache["token"]


def _fetch_page(url: str) -> str | None:
    try:
        response = httpx.get(
            url,
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Ihy self-hosted music server)"},
        )
    except httpx.HTTPError as exc:
        logger.warning("Spotify page fetch failed: %s", exc)
        return None
    return response.text if response.status_code == 200 else None


def resolve_title(url: str) -> str | None:
    """Extract the artist/album name from a public open.spotify.com page.
    Works without API credentials — used as the no-credentials fallback."""
    page = _fetch_page(url)
    if page is None:
        return None
    match = _OG_TITLE_RE.search(page)
    return html.unescape(match.group(1)) if match else None


def resolve_track_label(url: str) -> str | None:
    """Build a human-readable "Artist - Title" label for a Spotify track URL,
    from the public page metadata (no credentials needed)."""
    page = _fetch_page(url)
    if page is None:
        return None
    title_match = _OG_TITLE_RE.search(page)
    if title_match is None:
        return None
    title = html.unescape(title_match.group(1))
    desc_match = _OG_DESC_RE.search(page)
    if desc_match:
        # og:description looks like "Artist · Song · 2020"
        artist = html.unescape(desc_match.group(1)).split("·")[0].strip()
        if artist and artist.lower() != title.lower():
            return f"{artist} - {title}"
    return title


def search_artists(
    client_id: str, client_secret: str, query: str, limit: int = 10
) -> list[dict]:
    """Search artists on Spotify. Returns id, name, url, image and follower count."""
    token = _get_token(client_id, client_secret)
    try:
        response = httpx.get(
            SEARCH_URL,
            params={"q": query, "type": "artist", "limit": limit},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise SpotifyError(f"Spotify search request failed: {exc}") from exc
    if response.status_code != 200:
        raise SpotifyError(f"Spotify search failed ({response.status_code})")
    items = response.json().get("artists", {}).get("items", [])
    results = []
    for item in items:
        images = item.get("images") or []
        results.append(
            {
                "id": item["id"],
                "name": item["name"],
                "url": item.get("external_urls", {}).get("spotify", ""),
                "image": images[-1]["url"] if images else None,
                "followers": item.get("followers", {}).get("total"),
            }
        )
    return results
