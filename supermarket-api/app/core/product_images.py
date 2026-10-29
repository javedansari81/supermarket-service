"""
Product images: an upload (JPG, PNG or WEBP) is checked, turned upright (phone photos) and
saved as two WebP files in object storage: <key>.webp (800 px, product page) and
<key>_thumb.webp (320 px, product cards and lists). Every upload gets a new key, so images
can be cached for good. Images load from PRODUCT_IMAGE_PUBLIC_URL when set, else from the API.
"""
import io
import re
import uuid
from typing import Optional, Tuple
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from app.core.config import settings

LARGE_SIZE = 800
THUMB_SIZE = 320
WEBP_QUALITY = 82
# Larger pictures are refused before decoding (protects the server's memory)
MAX_PIXELS = 40_000_000
CONTENT_TYPE = "image/webp"
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# Only product image files can be read through the API, never other stored files (bills)
KEY_PATTERN = re.compile(r"^products/tenant_[0-9]+/product_[0-9]+/[0-9a-f]{32}(_thumb)?\.webp$")
API_IMAGE_PATH = "/shop/images/"


def new_key(tenant_id: int, product_id: int) -> str:
    return f"products/tenant_{tenant_id}/product_{product_id}/{uuid.uuid4().hex}"


def file_keys(key: str) -> Tuple[str, str]:
    """(large, thumbnail) file names of an image key"""
    return f"{key}.webp", f"{key}_thumb.webp"


def _webp(image: Image.Image, size: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((size, size), Image.LANCZOS)
    out = io.BytesIO()
    copy.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
    return out.getvalue()


def process(content: bytes) -> Tuple[bytes, bytes]:
    """(large, thumbnail) WebP files; 400 when the file is not a usable picture"""
    invalid = HTTPException(status_code=400, detail="Only JPG, PNG or WEBP pictures are allowed")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in ALLOWED_FORMATS:
                raise invalid
            if image.width * image.height > MAX_PIXELS:
                raise HTTPException(status_code=400, detail="The picture is too large; "
                                                            "use one under 40 megapixels")
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
            return _webp(image, LARGE_SIZE), _webp(image, THUMB_SIZE)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise invalid


def image_url(key: Optional[str], thumb: bool = False) -> Optional[str]:
    """Address of a product image: absolute when PRODUCT_IMAGE_PUBLIC_URL is set, otherwise a
    path under the API (e.g. /shop/images/...) that clients join to their API base address"""
    if not key:
        return None
    name = file_keys(key)[1 if thumb else 0]
    base = settings.PRODUCT_IMAGE_PUBLIC_URL.strip().rstrip("/")
    return f"{base}/{name}" if base else f"{API_IMAGE_PATH}{name}"
