from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import require_admin
from pydantic import BaseModel
from app.models.models import User, Professional, Booking, Payment, Document, DocStatus, UserRole
from app.utils.pricing import MINIMUM_PRICES, HOUR_RATES, INITIAL_SERVICE_FEE

router = APIRouter(prefix="/admin", tags=["admin"])

def _ser_user(u: User) -> dict:
    """Serialize user safely — no password_hash, enum as string value."""
    prof = None
    if u.role.value not in ("client", "admin"):
        from app.models.models import Professional
        from app.core.database import SessionLocal
        # Try to get professional data for city/state
        session = SessionLocal()
        try:
            prof = session.query(Professional).filter(Professional.user_id == u.id).first()
        finally:
            session.close()
    return {
        "id":         u.id,
        "email":      u.email,
        "full_name":  u.full_name,
        "phone":      u.phone,
        "role":       u.role.value if hasattr(u.role, 'value') else str(u.role),
        "is_active":  u.is_active,
        "is_verified":u.is_verified,
        "created_at": u.created_at,
        "city":       prof.city if prof else None,
        "state":      prof.state if prof else None,
    }

def _ser_prof(prof: Professional, user: User, docs: list) -> dict:
    return {
        "id":               prof.id,
        "user_id":          prof.user_id,
        "full_name":        user.full_name if user else "—",
        "email":            user.email     if user else "—",
        "phone":            user.phone     if user else "—",
        "role":             user.role.value if user and hasattr(user.role, 'value') else "—",
        "council_number":   prof.council_number,
        "council_state":    prof.council_state,
        "council_type":     prof.council_type,
        "city":             prof.city,
        "services_offered": prof.services_offered or [],
        "markup_pct":       prof.markup_pct or 0,
        "rating_avg":       prof.rating_avg,
        "rating_count":     prof.rating_count,
        "approval_status":  prof.approval_status.value if hasattr(prof.approval_status, 'value') else str(prof.approval_status),
        "is_available":     prof.is_available,
        "documents": [
            {
                "id":       d.id,
                "doc_type": d.doc_type,
                "file_url": d.file_url,
                "status":   d.status.value if hasattr(d.status, 'value') else str(d.status),
                "rejection_reason": d.rejection_reason,
            }
            for d in docs
        ],
    }

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    return {
        "total_users":         db.query(User).count(),
        "total_clients":       db.query(User).filter(User.role == UserRole.client).count(),
        "total_professionals": db.query(User).filter(User.role != UserRole.client, User.role != UserRole.admin).count(),
        "total_nurses":        db.query(User).filter(User.role == UserRole.nurse).count(),
        "total_technicians":   db.query(User).filter(User.role == UserRole.technician).count(),
        "total_nursing_assistants": db.query(User).filter(User.role == UserRole.nursing_assistant).count(),
        "total_caregivers":    db.query(User).filter(User.role == UserRole.caregiver).count(),
        "pending_approvals":   db.query(Professional).filter(Professional.approval_status == DocStatus.pending).count(),
        "total_bookings":      db.query(Booking).count(),
        "total_revenue":       db.query(Payment).filter(Payment.status.in_(["held", "released"])).with_entities(
                                   __import__("sqlalchemy").func.sum(Payment.commission)).scalar() or 0,
    }

@router.get("/users")
def get_users(role: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [_ser_user(u) for u in q.order_by(User.created_at.desc()).all()]

@router.patch("/users/{user_id}/block")
def block_user(user_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == UserRole.admin:
        raise HTTPException(400, "Cannot block admin users")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}

@router.get("/professionals")
def get_professionals(status: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Professional)
    if status:
        q = q.filter(Professional.approval_status == status)
    professionals = q.order_by(Professional.created_at.desc()).all()
    result = []
    for prof in professionals:
        user = db.query(User).filter(User.id == prof.user_id).first()
        docs = db.query(Document).filter(Document.user_id == prof.user_id).all()
        result.append(_ser_prof(prof, user, docs))
    return result

@router.patch("/professionals/{prof_id}/approve")
def approve_professional(prof_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.approved
    db.commit()
    return {"id": prof_id, "status": "approved"}

@router.patch("/professionals/{prof_id}/reject")
def reject_professional(prof_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.rejected
    prof.is_available    = False
    db.commit()
    return {"id": prof_id, "status": "rejected"}

@router.get("/bookings")
def get_bookings(status: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Booking)
    if status:
        q = q.filter(Booking.status == status)
    bookings = q.order_by(Booking.created_at.desc()).all()
    return [
        {
            **{c.key: getattr(b, c.key) for c in b.__table__.columns},
            "status": b.status.value if hasattr(b.status, 'value') else str(b.status),
            "cancel_reason": getattr(b, 'cancel_reason', None),
        }
        for b in bookings
    ]

_commission = {"rate": 12.0}

@router.get("/commission")
def get_commission(_=Depends(require_admin)):
    return _commission

@router.put("/commission")
def update_commission(rate: float, _=Depends(require_admin)):
    if not (0 < rate < 100):
        raise HTTPException(400, "Rate must be between 0 and 100")
    _commission["rate"] = rate
    return _commission

@router.get("/pricing")
def get_pricing_table(_=Depends(require_admin)):
    return {
        role: {
            "initial_fee": INITIAL_SERVICE_FEE[role],
            "day_rate": HOUR_RATES[role]["day"],
            "night_rate": HOUR_RATES[role]["night"],
        }
        for role in HOUR_RATES
    }

@router.patch("/pricing/{role}/{field}")
def update_pricing(role: str, field: str, value: float, _=Depends(require_admin)):
    if role not in HOUR_RATES:
        raise HTTPException(400, f"Invalid role. Must be: {list(HOUR_RATES.keys())}")
    if field not in ("initial_fee", "day_rate", "night_rate"):
        raise HTTPException(400, "field must be 'initial_fee', 'day_rate', or 'night_rate'")
    if value <= 0:
        raise HTTPException(400, "Value must be positive")
    if field == "initial_fee":
        INITIAL_SERVICE_FEE[role] = round(value, 2)
    elif field == "day_rate":
        HOUR_RATES[role]["day"] = round(value, 2)
    else:
        HOUR_RATES[role]["night"] = round(value, 2)
    return {"updated": True, "role": role, "field": field, "value": round(value, 2)}
# ── Document Verification ─────────────────────────────────────────────────────

REQUIRED_DOCS_BASE = {"photo_id", "diploma", "criminal", "selfie"}
REQUIRED_DOCS_NURSING = {"photo_id", "diploma", "criminal", "selfie", "coren_negative"}
REQUIRED_DOCS_CLIENT = {"client_id", "client_selfie"}

def _get_required_docs(user_id: str, db: Session) -> set:
    """Return required doc types based on user role."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return REQUIRED_DOCS_BASE
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role == "client":
        return REQUIRED_DOCS_CLIENT
    elif role == "caregiver":
        return REQUIRED_DOCS_BASE
    else:
        return REQUIRED_DOCS_NURSING

@router.patch("/documents/{doc_id}/approve")
def approve_document(doc_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.status = DocStatus.approved
    doc.rejection_reason = None
    db.commit()

    # Auto-approve professional if all required docs are approved
    _check_auto_approve(doc.user_id, db)

    return {"id": doc_id, "status": "approved"}

@router.patch("/documents/{doc_id}/reject")
def reject_document(doc_id: str, reason: str = "Documento inválido ou ilegível", db: Session = Depends(get_db), _=Depends(require_admin)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.status = DocStatus.rejected
    doc.rejection_reason = reason
    db.commit()

    # If any doc is rejected, professional stays/goes to pending / client loses verified
    user = db.query(User).filter(User.id == doc.user_id).first()
    if user:
        role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        if role == "client":
            user.is_verified = False
            db.commit()
        else:
            prof = db.query(Professional).filter(Professional.user_id == doc.user_id).first()
            if prof and prof.approval_status == DocStatus.approved:
                prof.approval_status = DocStatus.pending
                db.commit()

    return {"id": doc_id, "status": "rejected", "reason": reason}

def _check_auto_approve(user_id: str, db: Session):
    """Auto-approve professional or auto-verify client when ALL required docs are approved."""
    required = _get_required_docs(user_id, db)
    docs = db.query(Document).filter(Document.user_id == user_id).all()
    approved_types = {d.doc_type for d in docs if d.status == DocStatus.approved}

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    role = user.role.value if hasattr(user.role, 'value') else str(user.role)

    if required.issubset(approved_types):
        if role == "client":
            if not user.is_verified:
                user.is_verified = True
                db.commit()
        else:
            prof = db.query(Professional).filter(Professional.user_id == user_id).first()
            if prof and prof.approval_status != DocStatus.approved:
                prof.approval_status = DocStatus.approved
                db.commit()
# ── #4: COREN QR Code Verification ────────────────────────────────────────────

class CorenVerifyRequest(BaseModel):
    qr_data: str  # Raw text from QR scan

@router.post("/coren-verify")
def verify_coren_qr(body: CorenVerifyRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Parse COREN QR code data and auto-verify against professional records."""
    raw = body.qr_data.strip()

    # Common COREN QR formats:
    # "COREN-SP 123456 - NOME COMPLETO - TECNICO DE ENFERMAGEM - ATIVO"
    # URL format: "https://portal.coren-sp.gov.br/verificar/123456"
    extracted = {
        "coren_number": None,
        "name": None,
        "category": None,
        "state": None,
        "status": None,
        "raw": raw,
    }

    # Try to parse structured format
    parts = raw.replace(" - ", "|").replace(" – ", "|").split("|")
    for part in parts:
        part = part.strip()
        p_upper = part.upper()
        if "COREN" in p_upper:
            # Extract state and number
            import re
            state_match = re.search(r'COREN[- ]?([A-Z]{2})', p_upper)
            num_match = re.search(r'(\d{4,})', part)
            if state_match:
                extracted["state"] = state_match.group(1)
            if num_match:
                extracted["coren_number"] = num_match.group(1)
        elif p_upper in ("ATIVO", "ACTIVE", "REGULAR"):
            extracted["status"] = "active"
        elif p_upper in ("INATIVO", "INACTIVE", "SUSPENSO", "SUSPENDED", "CANCELADO"):
            extracted["status"] = "inactive"
        elif any(cat in p_upper for cat in ["ENFERMEIRO", "TÉCNICO", "AUXILIAR", "NURSE", "TECHNICIAN"]):
            extracted["category"] = part.strip()
        elif len(part) > 5 and not part.isdigit():
            if not extracted["name"]:
                extracted["name"] = part.strip()

    # Try URL format
    if not extracted["coren_number"]:
        import re
        url_match = re.search(r'coren[- ]?([a-z]{2}).*?(\d{4,})', raw.lower())
        if url_match:
            extracted["state"] = url_match.group(1).upper()
            extracted["coren_number"] = url_match.group(2)

    if not extracted["coren_number"]:
        return {"success": False, "message": "Não foi possível extrair o número COREN do QR code.", "extracted": extracted,
                "requires_manual_review": True, "notification": "Admin: verificação automática falhou — revisão manual necessária."}

    # Try to match with a professional in our system
    match = None
    pros = db.query(Professional).filter(Professional.council_number != None).all()
    for p in pros:
        if p.council_number and str(p.council_number) == str(extracted["coren_number"]):
            match = p
            break

    if match:
        user = db.query(User).filter(User.id == match.user_id).first()
        return {
            "success": True,
            "matched": True,
            "professional_id": match.id,
            "professional_name": user.full_name if user else None,
            "extracted": extracted,
            "auto_verify": extracted.get("status") == "active",
            "message": f"Profissional encontrado: {user.full_name if user else 'N/A'}. COREN {'ativo' if extracted.get('status') == 'active' else 'verificação manual necessária'}.",
        }

    return {
        "success": True,
        "matched": False,
        "extracted": extracted,
        "message": f"COREN {extracted['coren_number']} extraído com sucesso, mas nenhum profissional correspondente encontrado no sistema.",
    }

# ── #32: Document Access Logging ───────────────────────────────────────────────

class DocumentAccessLog(BaseModel):
    admin_name: str
    admin_id: str
    action: str  # "viewed" | "downloaded"
    doc_id: str
    doc_type: str
    professional_id: str
    timestamp: str

_doc_access_log = []  # In production, store in DB table

@router.post("/documents/{doc_id}/log-access")
def log_doc_access(doc_id: str, action: str = "viewed", db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """Log every document access by admin."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    from datetime import datetime, timezone
    entry = {
        "admin_name": current.full_name,
        "admin_id": current.id,
        "action": action,
        "doc_id": doc_id,
        "doc_type": doc.doc_type,
        "user_id": doc.user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _doc_access_log.append(entry)
    return {"logged": True, **entry}

@router.get("/documents/access-log")
def get_doc_access_log(_=Depends(require_admin)):
    """Return document access audit log."""
    return _doc_access_log[-100:]  # Last 100 entries
# ── #34: Request New Documents ─────────────────────────────────────────────────

class DocRequestPayload(BaseModel):
    user_id:  str
    doc_type: str
    reason:   str

@router.post("/documents/request")
def request_new_document(body: DocRequestPayload, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """Admin requests a specific document from a user. Creates a placeholder pending doc."""
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Check if doc already exists
    existing = db.query(Document).filter(
        Document.user_id == body.user_id,
        Document.doc_type == body.doc_type,
    ).first()

    if existing:
        # Reset to pending with new request reason
        existing.status = DocStatus.pending
        existing.rejection_reason = f"[SOLICITADO] {body.reason}"
        existing.file_url = None
        db.commit()
        doc_id = existing.id
    else:
        # Create placeholder doc entry
        doc = Document(
            user_id=body.user_id,
            doc_type=body.doc_type,
            status=DocStatus.pending,
            rejection_reason=f"[SOLICITADO] {body.reason}",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        doc_id = doc.id

    # Revoke verification while waiting
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role == "client":
        user.is_verified = False
    else:
        prof = db.query(Professional).filter(Professional.user_id == body.user_id).first()
        if prof:
            prof.approval_status = DocStatus.pending
    db.commit()

    # Create notification for user
    try:
        from app.routes.notifications import create_notification
        create_notification(
            user_id=body.user_id,
            type="system",
            title="Documento solicitado",
            message=f"A equipe CuidaU solicitou o documento '{body.doc_type}'. Motivo: {body.reason}. Acesse seu perfil para enviar.",
        )
    except:
        pass

    return {
        "doc_id": doc_id,
        "user_id": body.user_id,
        "doc_type": body.doc_type,
        "reason": body.reason,
        "message": f"Documento '{body.doc_type}' solicitado. Usuário será notificado.",
    }
# ── 48c: Document Download Failure Logging ─────────────────────────────────────

_download_failure_log = []

@router.post("/documents/{doc_id}/log-download-failure")
def log_download_failure(doc_id: str, status_code: int = 0, error: str = "", _=Depends(require_admin)):
    """48c: Log every failed document download attempt."""
    from datetime import datetime, timezone
    entry = {"doc_id": doc_id, "status_code": status_code, "error": error,
             "timestamp": datetime.now(timezone.utc).isoformat()}
    _download_failure_log.append(entry)
    return entry

@router.get("/documents/download-failures")
def get_download_failures(_=Depends(require_admin)):
    """48c: Return recent download failure log."""
    return _download_failure_log[-100:]

# ── 52e: Observability Dashboard ───────────────────────────────────────────────

@router.get("/observability")
def get_observability(_=Depends(require_admin)):
    """52e: Return recent observability events for Changes 44, 46, 48."""
    from app.utils.observability import get_recent_events
    return get_recent_events()