import cloudinary
import cloudinary.uploader
import cloudinary.utils
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
    """Generate a fresh signed Cloudinary URL from a stored URL or public_id.
    Handles both /upload/ and /authenticated/ URL formats."""
    if not file_url_or_public_id:
        return ""

    public_id = extract_public_id(file_url_or_public_id)
    if not public_id:
        return file_url_or_public_id  # can't extract, return as-is

    try:
        resource_type = "raw" if ".pdf" in file_url_or_public_id.lower() else "image"
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            sign_url=True,
            type="authenticated",
            resource_type=resource_type,
            secure=True,
        )
        return url
    except Exception as e:
        print(f"[CLOUDINARY] Signed URL failed for {public_id}: {e}")
        return file_url_or_public_id


def extract_public_id(url_or_id: str) -> str:
    """Extract public_id from a Cloudinary URL.
    Handles /upload/, /authenticated/, with or without signatures and versions."""
    if not url_or_id:
        return ""
    if not url_or_id.startswith("http"):
        return url_or_id  # already a public_id

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