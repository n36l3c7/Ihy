import logging
from collections.abc import Callable
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.models.library import Artist
from app.services.images import InvalidImageError, validated_suffix

logger = logging.getLogger(__name__)

DEEZER_SEARCH_URL = "https://api.deezer.com/search/artist"

# fetcher(artist name) -> raw image bytes or None
ImageFetcher = Callable[[str], "bytes | None"]


def _images_dir(images_dir: Path | None) -> Path:
    return images_dir if images_dir is not None else get_settings().data_dir / "artists"


def fetch_deezer_image(name: str) -> bytes | None:
    """Look the artist up on Deezer (open API, no key) and download the picture."""
    try:
        response = httpx.get(DEEZER_SEARCH_URL, params={"q": name, "limit": 5}, timeout=10)
        if response.status_code != 200:
            return None
        items = response.json().get("data", [])
        chosen = next(
            (item for item in items if item.get("name", "").lower() == name.lower()),
            items[0] if items else None,
        )
        if not chosen:
            return None
        url = chosen.get("picture_xl") or chosen.get("picture_big") or chosen.get("picture")
        if not url:
            return None
        image = httpx.get(url, timeout=10)
        return image.content if image.status_code == 200 else None
    except httpx.HTTPError as exc:
        logger.warning("Deezer lookup failed for %s: %s", name, exc)
        return None


def resolve_artist_image(
    artist: Artist,
    images_dir: Path | None = None,
    fetcher: ImageFetcher = fetch_deezer_image,
) -> Path | None:
    """Cached image, or a one-time automatic lookup on Deezer.
    A miss marker prevents hammering the API for artists without pictures."""
    directory = _images_dir(images_dir)
    for suffix in (".jpg", ".png"):
        cached = directory / f"artist_{artist.id}{suffix}"
        if cached.is_file():
            return cached
    miss_marker = directory / f"artist_{artist.id}.miss"
    if miss_marker.is_file():
        return None

    data = fetcher(artist.name)
    directory.mkdir(parents=True, exist_ok=True)
    if data is None:
        miss_marker.touch()
        return None
    try:
        suffix = validated_suffix(data)
    except InvalidImageError:
        miss_marker.touch()
        return None
    target = directory / f"artist_{artist.id}{suffix}"
    target.write_bytes(data)
    return target


def save_artist_image(artist: Artist, data: bytes, images_dir: Path | None = None) -> Path:
    """Store a manually uploaded artist image, replacing cache and miss marker."""
    suffix = validated_suffix(data)
    directory = _images_dir(images_dir)
    directory.mkdir(parents=True, exist_ok=True)
    invalidate_artist_image_cache(artist.id, images_dir=directory)
    target = directory / f"artist_{artist.id}{suffix}"
    target.write_bytes(data)
    return target


def invalidate_artist_image_cache(artist_id: int, images_dir: Path | None = None) -> None:
    directory = _images_dir(images_dir)
    for suffix in (".jpg", ".png", ".miss"):
        try:
            (directory / f"artist_{artist_id}{suffix}").unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove cached artist image %s", artist_id)
