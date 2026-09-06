from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Document, Professional, DocStatus, User
from app.utils.cloudinary_helper import upload_document, ALLOWED_TYPES, MAX_SIZE_MB

router = APIRouter(prefix="/documents", tags=["documents"])

VALID_DOC_TYPES = {"photo_id", "diploma", "criminal", "selfie", "vaccination", "coren_negative", "client_id", "client_selfie", "other"}

@router.post("/upload")
async def upload_doc(
    doc_type: str        = Form(...),
    file:     UploadFile = File(...),
    db:       Session    = Depends(get_db),
    current:  User       = Depends(get_current_user),
):
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(400, f"Invalid doc_type. Must be one of: {VALID_DOC_TYPES}")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPG, PNG and PDF files are allowed.")

    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Max size is {MAX_SIZE_MB}MB.")

    try:
        url = upload_document(
            file_bytes=contents,
            filename=file.filename,
            user_id=current.id,
            doc_type=doc_type,
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")

    existing = db.query(Document).filter(
        Document.user_id  == current.id,
        Document.doc_type == doc_type,
    ).first()

    if existing:
        existing.file_url = url
        existing.status   = DocStatus.pending
    else:
        doc = Document(user_id=current.id, doc_type=doc_type, file_url=url, status=DocStatus.pending)
        db.add(doc)

    db.commit()
    return {"url": url, "doc_type": doc_type, "status": "pending"}

@router.get("/my-documents")
def get_my_documents(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    from app.utils.cloudinary_helper import generate_signed_url
    docs = db.query(Document).filter(Document.user_id == current.id).all()
    return [{
        "id": d.id, "doc_type": d.doc_type,
        "file_url": generate_signed_url(d.file_url) if d.file_url else None,
        "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
        "rejection_reason": d.rejection_reason,
    } for d in docs]

@router.delete("/{doc_id}")
def delete_my_document(doc_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """4-1,4-2: Professional deletes their own document from DB + Cloudinary."""
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current.id).first()
    if not doc:
        raise HTTPException(404, "Documento não encontrado ou não pertence a você.")

    # Don't allow deleting approved docs that are in use
    if hasattr(doc.status, 'value') and doc.status.value == "approved":
        raise HTTPException(400, "Documentos aprovados não podem ser excluídos. Use a opção de substituir.")

    # Delete from Cloudinary
    if doc.file_url:
        try:
            from app.utils.cloudinary_helper import extract_public_id
            import cloudinary.uploader
            public_id = extract_public_id(doc.file_url)
            if public_id:
                cloudinary.uploader.destroy(public_id, type="authenticated")
        except Exception as e:
            print(f"[DOC] Cloudinary delete failed for {doc_id}: {e}")
            # Continue with DB delete even if Cloudinary fails

    doc_type = doc.doc_type
    db.delete(doc)
    db.commit()

    return {"deleted": True, "doc_id": doc_id, "doc_type": doc_type,
            "message": f"Documento '{doc_type}' excluído. Envie um novo se necessário."}

@router.get("/status/{user_id}")
def get_document_status(user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if current.id != user_id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    from app.utils.cloudinary_helper import generate_signed_url
    docs = db.query(Document).filter(Document.user_id == user_id).all()
    docs_out = [{
        "id": d.id, "doc_type": d.doc_type,
        "file_url": generate_signed_url(d.file_url) if d.file_url else None,
        "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
        "rejection_reason": d.rejection_reason,
    } for d in docs]
    return {
        "documents":    docs_out,
        "has_photo_id": any(d.doc_type == "photo_id" and d.file_url for d in docs),
        "has_diploma":  any(d.doc_type == "diploma"  and d.file_url for d in docs),
        "has_criminal": any(d.doc_type == "criminal" and d.file_url for d in docs),
        "has_selfie":   any(d.doc_type == "selfie"   and d.file_url for d in docs),
        "all_uploaded": all(
            any(d.doc_type == t for d in docs)
            for t in ["photo_id", "diploma", "criminal", "selfie"]
        ),
    }