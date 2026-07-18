import logging
from collections.abc import Callable
from datetime import UTC, datetime
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models.artist_info import ArtistInfo
from app.models.library import Artist

logger = logging.getLogger(__name__)

WIKIPEDIA_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/"

# fetcher(artist name) -> (bio, page url) or None
BioFetcher = Callable[[str], "tuple[str, str | None] | None"]


def fetch_wikipedia_summary(name: str) -> tuple[str, str | None] | None:
    try:
        response = httpx.get(
            WIKIPEDIA_SUMMARY_URL + quote(name, safe=""),
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": "Ihy self-hosted music server"},
        )
    except httpx.HTTPError as exc:
        logger.warning("Wikipedia lookup failed for %s: %s", name, exc)
        return None
    if response.status_code != 200:
        return None
    data = response.json()
    if data.get("type") != "standard":
        return None  # disambiguation or missing page
    extract = (data.get("extract") or "").strip()
    if not extract:
        return None
    url = data.get("content_urls", {}).get("desktop", {}).get("page")
    return extract, url


def get_or_fetch(
    db: Session,
    artist: Artist,
    *,
    refresh: bool = False,
    fetcher: BioFetcher | None = None,
) -> ArtistInfo:
    existing = db.get(ArtistInfo, artist.id)
    if existing is not None and not refresh:
        return existing

    if fetcher is None:
        fetcher = fetch_wikipedia_summary
    fetched = fetcher(artist.name)

    if existing is None:
        existing = ArtistInfo(artist_id=artist.id)
        db.add(existing)
    if fetched is not None:
        existing.bio, existing.url = fetched
        existing.source = "wikipedia"
    else:
        existing.bio = None
        existing.url = None
        existing.source = None
    existing.fetched_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(existing)
    return existing
