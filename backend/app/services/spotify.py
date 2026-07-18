import logging
import time

import httpx

logger = logging.getLogger(__name__)

TOKEN_URL = "https://accounts.spotify.com/api/token"
SEARCH_URL = "https://api.spotify.com/v1/search"

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
