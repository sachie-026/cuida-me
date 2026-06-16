from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import Document, Professional, DocStatus, User
from app.utils.cloudinary_helper import upload_document, ALLOWED_TYPES, MAX_SIZE_MB
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router   = APIRouter(prefix="/documents", tags=["documents"])
security = HTTPBearer()

VALID_DOC_TYPES = {"photo_id", "diploma", "criminal", "selfie", "vaccination", "other"}

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload["sub"]

@router.post("/upload")
async def upload_doc(
    doc_type:    str        = Form(...),
    file:        UploadFile = File(...),
    db:          Session    = Depends(get_db),
    user_id:     str        = Depends(get_current_user_id),
):
    # Validate doc type
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(400, f"Invalid doc_type. Must be one of: {VALID_DOC_TYPES}")

    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPG, PNG and PDF files are allowed.")

    # Validate file size
    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Max size is {MAX_SIZE_MB}MB.")

    # Upload to Cloudinary
    try:
        url = upload_document(
            file_bytes=contents,
            filename=file.filename,
            user_id=user_id,
            doc_type=doc_type,
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")

    # Save or update document record in DB
    existing = db.query(Document).filter(
        Document.user_id  == user_id,
        Document.doc_type == doc_type,
    ).first()

    if existing:
        existing.file_url = url
        existing.status   = DocStatus.pending  # reset to pending on re-upload
    else:
        doc = Document(user_id=user_id, doc_type=doc_type, file_url=url, status=DocStatus.pending)
        db.add(doc)

    db.commit()
    return {"url": url, "doc_type": doc_type, "status": "pending"}

@router.get("/my-documents")
def get_my_documents(
    db:      Session = Depends(get_db),
    user_id: str     = Depends(get_current_user_id),
):
    docs = db.query(Document).filter(Document.user_id == user_id).all()
    return docs

@router.get("/status/{user_id}")
def get_document_status(user_id: str, db: Session = Depends(get_db)):
    """Check what documents a professional has uploaded."""
    docs = db.query(Document).filter(Document.user_id == user_id).all()
    return {
        "documents":    docs,
        "has_photo_id": any(d.doc_type == "photo_id" and d.file_url for d in docs),
        "has_diploma":  any(d.doc_type == "diploma"  and d.file_url for d in docs),
        "has_criminal": any(d.doc_type == "criminal" and d.file_url for d in docs),
        "has_selfie":   any(d.doc_type == "selfie"   and d.file_url for d in docs),
        "all_uploaded": all([
            any(d.doc_type == t for d in docs)
            for t in ["photo_id", "diploma", "criminal", "selfie"]
        ]),
    }