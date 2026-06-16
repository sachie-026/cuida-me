import cloudinary
import cloudinary.uploader
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