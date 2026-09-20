import cloudinary
import cloudinary.uploader
import cloudinary.api
import cloudinary.utils
import re
from app.core.config import settings

cloudinary.config(
    cloud_name = settings.CLOUDINARY_CLOUD_NAME,
    api_key    = settings.CLOUDINARY_API_KEY,
    api_secret = settings.CLOUDINARY_API_SECRET,
    secure     = True,
)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
MAX_SIZE_MB   = 10

def upload_document(file_bytes: bytes, filename: str, user_id: str, doc_type: str) -> str:
    """Upload a document to Cloudinary and return the secure URL."""
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=f"cuida-me/documents/{user_id}",
        public_id=f"{doc_type}_{user_id}",
        overwrite=True,
        resource_type="auto",
        tags=[doc_type, user_id],
    )
    return result["secure_url"]


def generate_signed_url(file_url_or_public_id: str) -> str:
    """Get a working URL for a Cloudinary file.
    
    Strategy: Ask Cloudinary's API for the file directly. The API returns
    the canonical secure_url that always works — no guessing resource_type,
    delivery type, or format needed.
    
    Tries: image/upload → raw/upload → image/authenticated → raw/authenticated
    """
    if not file_url_or_public_id:
        return ""

    public_id = extract_public_id(file_url_or_public_id)
    if not public_id:
        return file_url_or_public_id

    # Detect delivery type from stored URL
    delivery_type = "upload"
    if "/authenticated/" in file_url_or_public_id:
        delivery_type = "authenticated"

    # Detect stored resource_type from URL
    stored_rt = None
    if file_url_or_public_id.startswith("http"):
        rt_match = re.search(r'cloudinary\.com/[^/]+/(image|raw|video)/', file_url_or_public_id)
        if rt_match:
            stored_rt = rt_match.group(1)

    # Build list of (resource_type, type) combos to try — stored first, then alternatives
    combos = []
    if stored_rt:
        combos.append((stored_rt, delivery_type))
    for rt in ["image", "raw"]:
        for dt in [delivery_type, "upload", "authenticated"]:
            if (rt, dt) not in combos:
                combos.append((rt, dt))

    # Try each combo — ask Cloudinary API if file exists there
    for try_rt, try_dt in combos:
        try:
            info = cloudinary.api.resource(public_id, resource_type=try_rt, type=try_dt)
            # File found! Return its secure_url directly from Cloudinary
            url = info.get("secure_url", "")
            if url:
                return url
        except Exception:
            continue

    # All API lookups failed — file may not exist in Cloudinary
    # Return original URL as last resort
    print(f"[CLOUDINARY] File not found in any resource_type/type combo: {public_id}")
    return file_url_or_public_id


def extract_public_id(url_or_id: str) -> str:
    """Extract public_id from a Cloudinary URL.
    Handles /upload/, /authenticated/, with or without signatures and versions."""
    if not url_or_id:
        return ""
    if not url_or_id.startswith("http"):
        return url_or_id

    try:
        for marker in ["/upload/", "/authenticated/"]:
            if marker in url_or_id:
                after = url_or_id.split(marker, 1)[1]
                # Strip signature (s--xxxx--/)
                if after.startswith("s--"):
                    after = after.split("/", 1)[1] if "/" in after else after
                # Strip version (v1234567890/)
                if after.startswith("v") and "/" in after:
                    version_part = after[:after.index("/")]
                    if version_part[1:].isdigit():
                        after = after[after.index("/") + 1:]
                # Remove file extension
                if "." in after.split("/")[-1]:
                    after = after.rsplit(".", 1)[0]
                return after
    except Exception as e:
        print(f"[CLOUDINARY] extract_public_id failed: {e}")

    return ""