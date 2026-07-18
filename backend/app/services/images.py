import io

from PIL import Image

IMAGE_MAX_BYTES = 10 * 1024 * 1024


class InvalidImageError(Exception):
    pass


def validated_suffix(data: bytes) -> str:
    """Validate uploaded/fetched image bytes and return the file suffix."""
    if len(data) > IMAGE_MAX_BYTES:
        raise InvalidImageError("Image is too large (max 10 MB)")
    try:
        image = Image.open(io.BytesIO(data))
        image_format = image.format
        image.verify()
    except Exception as exc:
        raise InvalidImageError("Not a valid image file") from exc
    if image_format not in ("JPEG", "PNG"):
        raise InvalidImageError("Only JPEG and PNG images are supported")
    return ".png" if image_format == "PNG" else ".jpg"
