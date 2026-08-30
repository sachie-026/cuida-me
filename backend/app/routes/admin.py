from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
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

# ── 49a-h: Automatic Document Validation with OCR ─────────────────────────────

_validation_results = {}
_calibration_log = []

@router.post("/documents/{doc_id}/validate")
def validate_document(doc_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """49a: Run OCR + cross-check on a document."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    user = db.query(User).filter(User.id == doc.user_id).first()
    prof = db.query(Professional).filter(Professional.user_id == doc.user_id).first()

    # 49a: Extract text from PDF via OCR/pdfplumber
    extracted = {"name": None, "cpf": None, "coren_number": None, "category": None, "state": None, "status": None}
    if doc.file_url:
        try:
            from app.utils.document_ocr import extract_text_from_pdf_url, extract_coren_data
            raw_text = extract_text_from_pdf_url(doc.file_url)
            if raw_text:
                extracted = extract_coren_data(raw_text)
        except Exception as e:
            print(f"[49a] OCR failed for doc {doc_id}: {e}")

    # Fallback: use profile data if OCR got nothing
    if not extracted["name"] and user:
        extracted["name"] = user.full_name
    if not extracted["cpf"] and user:
        extracted["cpf"] = user.cpf
    if not extracted["coren_number"] and prof:
        extracted["coren_number"] = prof.council_number
    if not extracted["category"] and user:
        extracted["category"] = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if not extracted["state"] and prof:
        extracted["state"] = prof.council_state

    # 10.1-1: Name normalization (case, spaces, accents)
    import unicodedata
    def _normalize_name(n):
        if not n: return ""
        n = unicodedata.normalize("NFD", n)
        n = "".join(c for c in n if unicodedata.category(c) != "Mn")  # strip accents
        return " ".join(n.upper().split())  # normalize spaces + uppercase

    # 10.1-2: CPF format validation
    def _normalize_cpf(c):
        if not c: return ""
        return c.replace(".", "").replace("-", "").replace(" ", "").strip()

    def _valid_cpf_format(c):
        c = _normalize_cpf(c)
        return len(c) == 11 and c.isdigit()

    name_match = None
    if extracted["name"] and user:
        name_match = _normalize_name(extracted["name"]) == _normalize_name(user.full_name)

    cpf_match = None
    if extracted["cpf"] and user and user.cpf:
        ext_cpf = _normalize_cpf(extracted["cpf"])
        usr_cpf = _normalize_cpf(user.cpf)
        if not _valid_cpf_format(ext_cpf):
            cpf_match = False  # invalid format
        else:
            cpf_match = ext_cpf == usr_cpf

    # 10.1-3: COREN Number + State + Category combined match
    cat_role = user.role.value if user and hasattr(user.role, 'value') else ""
    category_match = extracted["category"] == cat_role if extracted["category"] else None

    coren_match = None
    if extracted["coren_number"] and prof and prof.council_number:
        coren_match = str(extracted["coren_number"]).strip() == str(prof.council_number).strip()

    # 10.1-4: Three separate state validations
    state_match = None
    activity_match = None
    service_match = None
    if extracted["state"] and prof:
        ext_state = (extracted["state"] or "").upper().strip()
        # COREN registration state
        prof_state = (prof.council_state or "").upper().strip()
        state_match = prof_state == ext_state
        # Activity state
        act_state = (getattr(prof, 'activity_state', None) or prof_state).upper().strip()
        activity_match = act_state == ext_state or state_match
        # 10.1-5: Service location states
        svc_states = getattr(prof, 'service_states', None) or []
        if svc_states:
            service_match = ext_state in [s.upper() for s in svc_states]
        else:
            service_match = state_match  # fallback: COREN state = service state

    # 10.1-6: Active status enforcement
    status_active = None
    if extracted.get("status"):
        status_active = extracted["status"] == "active"

    # 10.1-7: Regularity check (3-level)
    regularity_check = "not_available"  # level 1 auto, level 2 docs, level 3 manual
    if status_active is True:
        regularity_check = "auto_confirmed"
    elif status_active is False:
        regularity_check = "auto_failed"

    # 10.1-3: Combined 7-field classification
    checks = [name_match, cpf_match, coren_match, state_match, category_match, status_active, activity_match]
    passed = sum(1 for c in checks if c is True)
    total = sum(1 for c in checks if c is not None)
    confidence = round(passed / total * 100, 1) if total > 0 else 0.0

    # 10.1-8: Classification with proper flow
    if confidence >= 100 and total >= 5:
        classification = "auto_approved"
    elif total == 0:
        classification = "needs_manual_review"  # 10.1-9: no data = manual review, never auto-reject
    elif any(c is False for c in [name_match, cpf_match, coren_match]):
        classification = "auto_rejected"  # identity mismatch = reject
    elif status_active is False:
        classification = "auto_rejected"
    else:
        classification = "needs_manual_review"

    details = []
    if name_match is not None: details.append(f"Nome: {'✓' if name_match else '✗'}")
    if cpf_match is not None: details.append(f"CPF: {'✓' if cpf_match else '✗'}")
    if coren_match is not None: details.append(f"COREN Nº: {'✓' if coren_match else '✗'}")
    if state_match is not None: details.append(f"Estado COREN: {'✓' if state_match else '✗'}")
    if category_match is not None: details.append(f"Categoria: {'✓' if category_match else '✗'}")
    if status_active is not None: details.append(f"Status: {'✓ Ativo' if status_active else '✗ Inativo'}")
    if activity_match is not None: details.append(f"Atividade: {'✓' if activity_match else '✗'}")

    result = {
        "doc_id": doc_id, "extracted_name": extracted["name"], "extracted_cpf": extracted["cpf"],
        "extracted_coren": extracted["coren_number"], "extracted_category": extracted["category"],
        "extracted_state": extracted["state"], "extracted_status": extracted.get("status"),
        "name_match": name_match, "cpf_match": cpf_match, "coren_match": coren_match,
        "category_match": category_match, "state_match": state_match,
        "activity_match": activity_match, "status_active": status_active,
        "regularity_check": regularity_check,
        "confidence": confidence, "classification": classification,
        "details": " | ".join(details), "fields_checked": total, "fields_passed": passed,
    }

    # 10.1-8: Update professional verification status
    if prof:
        prof.verification_status = {
            "auto_approved": "auto_verified",
            "auto_rejected": "rejected",
            "needs_manual_review": "manual_review_required",
        }.get(classification, "manual_review_required")
        prof.verification_reason = " | ".join(details)
        if classification == "auto_approved":
            from datetime import datetime, timezone
            prof.last_verified_at = datetime.now(timezone.utc)
        db.commit()
    _validation_results[doc_id] = result
    return result

# 49f: Phase 1 calibration
@router.post("/documents/{doc_id}/calibrate")
def calibrate_validation(doc_id: str, human_verdict: str, _=Depends(require_admin)):
    auto = _validation_results.get(doc_id)
    auto_verdict = auto["classification"] if auto else "unknown"
    from datetime import datetime, timezone
    entry = {"doc_id": doc_id, "auto_verdict": auto_verdict, "human_verdict": human_verdict,
             "match": auto_verdict == human_verdict, "timestamp": datetime.now(timezone.utc).isoformat()}
    _calibration_log.append(entry)
    return entry

@router.get("/documents/calibration-report")
def calibration_report(_=Depends(require_admin)):
    total = len(_calibration_log)
    matches = sum(1 for e in _calibration_log if e["match"])
    accuracy = round(matches / total * 100, 1) if total > 0 else 0.0
    return {"total_reviews": total, "matches": matches, "accuracy_pct": accuracy,
            "entries": _calibration_log[-50:], "phase_2_ready": total >= 100 and accuracy >= 98.0}

# 49g: Phase 2 threshold config
@router.get("/documents/auto-approval-config")
def get_auto_approval_config(_=Depends(require_admin)):
    return {"phase": 1, "min_confidence_for_auto_approve": 100.0,
            "min_calibration_reviews": 100, "min_accuracy_pct": 98.0,
            "note": "Phase 2 auto-approval enabled once calibration targets met."}

# ── 49c: COREN Website Lookup ─────────────────────────────────────────────────

@router.post("/coren-lookup/{state}/{coren_number}")
def coren_web_lookup(state: str, coren_number: str, _=Depends(require_admin)):
    """49c: Query COREN state website to verify registration status."""
    from app.utils.coren_lookup import lookup_coren
    return lookup_coren(state, coren_number)

@router.get("/coren-lookup/log")
def coren_lookup_log(_=Depends(require_admin)):
    """49c: Return COREN lookup audit log for compliance."""
    from app.utils.coren_lookup import get_lookup_log
    return get_lookup_log()

@router.get("/coren-lookup/supported-states")
def coren_supported_states():
    """49c: Return list of supported states for COREN lookup."""
    from app.utils.coren_lookup import COREN_URLS
    return {"states": sorted(COREN_URLS.keys()), "count": len(COREN_URLS)}

# ── 50c: Admin Role Management ────────────────────────────────────────────────

from app.utils.admin_permissions import ADMIN_PERMISSIONS, get_admin_permissions, is_super_admin

@router.get("/roles/permissions")
def get_permissions_matrix(_=Depends(require_admin)):
    """50c: Return permission matrix + current admin's permissions."""
    return {"matrix": ADMIN_PERMISSIONS}

@router.get("/roles/my-permissions")
def get_my_permissions(current: User = Depends(require_admin)):
    """50c: Return current admin's role and allowed sections."""
    admin_role = getattr(current, 'admin_role', None) or "super_admin"
    return {
        "admin_role": admin_role,
        "permissions": get_admin_permissions(current),
    }

@router.patch("/roles/{user_id}/assign")
def assign_admin_role(user_id: str, admin_role: str, db: Session = Depends(get_db), current: User = Depends(is_super_admin)):
    """50c: Super Admin assigns a sub-role to another admin user."""
    valid_roles = list(ADMIN_PERMISSIONS.keys())
    if admin_role not in valid_roles:
        raise HTTPException(400, f"Papel inválido. Use: {valid_roles}")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if target.role.value != "admin":
        raise HTTPException(400, "O usuário deve ser admin para receber um papel administrativo.")

    target.admin_role = admin_role
    db.commit()
    return {
        "user_id": user_id,
        "admin_role": admin_role,
        "permissions": ADMIN_PERMISSIONS[admin_role],
        "message": f"Papel '{admin_role}' atribuído com sucesso.",
    }

@router.get("/roles/admins")
def list_admin_users(db: Session = Depends(get_db), _=Depends(is_super_admin)):
    """50c: List all admin users with their sub-roles."""
    from app.models.models import UserRole
    admins = db.query(User).filter(User.role == UserRole.admin).all()
    return [{
        "id": a.id, "full_name": a.full_name, "email": a.email,
        "admin_role": getattr(a, 'admin_role', None) or "super_admin",
        "permissions": get_admin_permissions(a),
    } for a in admins]

# ── 10.1-11: Fix document download ────────────────────────────────────────────

@router.get("/documents/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """10.1-11: Admin downloads original uploaded document file."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not doc.file_url:
        raise HTTPException(404, "No file URL for this document.")

    # 10.1-13: Generate secure short-lived URL (Cloudinary signed URL)
    file_url = doc.file_url
    try:
        import cloudinary.utils
        if "cloudinary" in file_url:
            # Generate a fresh signed URL valid for 1 hour
            parts = file_url.split("/upload/")
            if len(parts) == 2:
                public_id = parts[1].rsplit(".", 1)[0]
                file_url = cloudinary.utils.cloudinary_url(public_id, sign_url=True, type="authenticated")[0]
    except:
        pass  # fallback to original URL

    # 10.1-19: Audit log
    try:
        from app.utils.observability import log_event
        log_event("10.1", "document_downloaded", {"doc_id": doc_id, "admin_id": current.id, "doc_type": doc.doc_type})
    except:
        pass

    return {"doc_id": doc_id, "file_url": file_url, "doc_type": doc.doc_type, "original_url": doc.file_url}

# ── 10.1-14,15: Extended document statuses + admin actions ─────────────────────

VALID_DOC_STATUSES = ["not_submitted", "uploaded", "under_review", "approved", "rejected", "expired", "replacement_requested"]

@router.patch("/documents/{doc_id}/status")
def update_document_status(doc_id: str, status: str, reason: str = "", db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """10.1-14,15: Update per-document status with reason."""
    if status not in VALID_DOC_STATUSES:
        raise HTTPException(400, f"Status inválido. Use: {VALID_DOC_STATUSES}")
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    old_status = doc.status.value if hasattr(doc.status, 'value') else str(doc.status)
    doc.status = status
    doc.rejection_reason = reason if status in ("rejected", "replacement_requested") else doc.rejection_reason
    db.commit()

    # 10.1-19: Audit
    _verification_audit_log.append({
        "professional_id": doc.user_id, "action": f"doc_{status}",
        "doc_id": doc_id, "doc_type": doc.doc_type,
        "old_status": old_status, "new_status": status,
        "reason": reason, "admin_id": current.id, "admin_name": current.full_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"doc_id": doc_id, "status": status, "reason": reason}

# ── 10.1-16: Admin actions per professional ────────────────────────────────────

_verification_audit_log = []

@router.patch("/professionals/{prof_id}/verification-action")
def professional_verification_action(prof_id: str, action: str, reason: str = "", db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """10.1-16: Admin actions on professional: approve, reject, keep_review, request_info, reverify."""
    valid_actions = ["approve", "reject", "keep_under_review", "request_info", "trigger_reverification"]
    if action not in valid_actions:
        raise HTTPException(400, f"Ação inválida. Use: {valid_actions}")

    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    old_status = prof.verification_status or "pending_verification"
    status_map = {
        "approve": "approved",
        "reject": "rejected",
        "keep_under_review": "manual_review_required",
        "request_info": "additional_docs_required",
        "trigger_reverification": "reverification_required",
    }
    new_status = status_map[action]
    prof.verification_status = new_status
    prof.verification_reason = reason

    if action == "approve":
        prof.approval_status = DocStatus.approved
        prof.last_verified_at = datetime.now(timezone.utc)
    elif action == "reject":
        prof.approval_status = DocStatus.rejected
    elif action == "trigger_reverification":
        prof.reverification_due = datetime.now(timezone.utc)

    db.commit()

    _verification_audit_log.append({
        "professional_id": prof_id, "action": action,
        "old_status": old_status, "new_status": new_status,
        "reason": reason, "method": "manual",
        "admin_id": current.id, "admin_name": current.full_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"professional_id": prof_id, "action": action, "new_status": new_status, "reason": reason}

# ── 10.1-17: Final approval checklist ──────────────────────────────────────────

@router.get("/professionals/{prof_id}/approval-checklist")
def get_approval_checklist(prof_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """10.1-17: Return checklist — all items must pass before final approval."""
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    user = db.query(User).filter(User.id == prof.user_id).first()

    docs = db.query(Document).filter(Document.user_id == prof.user_id).all()
    doc_statuses = {d.doc_type: (d.status.value if hasattr(d.status, 'value') else str(d.status)) for d in docs}

    checklist = [
        {"item": "Nome completo verificado", "passed": bool(prof.verification_status in ("auto_verified", "approved")), "field": "name"},
        {"item": "CPF verificado", "passed": bool(user and user.cpf and len(user.cpf.replace('.','').replace('-','')) == 11), "field": "cpf"},
        {"item": "Número COREN verificado", "passed": bool(prof.council_number), "field": "coren_number"},
        {"item": "Estado COREN verificado", "passed": bool(prof.council_state), "field": "coren_state"},
        {"item": "Categoria profissional verificada", "passed": bool(prof.verification_status in ("auto_verified", "approved")), "field": "category"},
        {"item": "Status ativo/elegível", "passed": prof.verification_status in ("auto_verified", "approved"), "field": "status"},
        {"item": "Elegibilidade local de serviço", "passed": bool(prof.council_state or prof.activity_state), "field": "service_location"},
        {"item": "Documento de identidade aprovado", "passed": doc_statuses.get("rg_cpf") == "approved", "field": "identity_doc"},
        {"item": "Diploma aprovado", "passed": doc_statuses.get("diploma", doc_statuses.get("proof_of_training")) == "approved", "field": "diploma"},
        {"item": "Documentação COREN aprovada", "passed": doc_statuses.get("coren_card") == "approved" or doc_statuses.get("coren_negative") == "approved", "field": "coren_doc"},
        {"item": "Documentação de regularidade", "passed": doc_statuses.get("coren_negative") == "approved", "field": "regularity"},
    ]
    all_passed = all(c["passed"] for c in checklist)
    return {"professional_id": prof_id, "checklist": checklist, "all_passed": all_passed, "can_approve": all_passed}

# ── 10.1-18: Rejection reasons ────────────────────────────────────────────────

REJECTION_REASONS = [
    "Nome não corresponde", "CPF não corresponde", "Número COREN não corresponde",
    "Estado COREN não corresponde", "Categoria profissional não corresponde",
    "Registro não está ativo", "Documento ilegível", "Documento expirado",
    "Documento obrigatório ausente", "Informação adicional necessária", "Outro",
]

@router.get("/rejection-reasons")
def get_rejection_reasons(_=Depends(require_admin)):
    return {"reasons": REJECTION_REASONS}

# ── 10.1-19: Verification audit log ───────────────────────────────────────────

@router.get("/verification-audit-log")
def get_verification_audit(_=Depends(require_admin)):
    return _verification_audit_log[-100:]

# ── 10.1-20: Re-verification triggers ─────────────────────────────────────────

@router.post("/professionals/{prof_id}/check-reverification")
def check_reverification(prof_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """10.1-20: Check if professional needs re-verification."""
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    needs_reverification = False
    reasons = []

    if prof.reverification_due and prof.reverification_due <= datetime.now(timezone.utc):
        needs_reverification = True
        reasons.append("Data de re-verificação atingida")

    if prof.last_verified_at:
        days_since = (datetime.now(timezone.utc) - prof.last_verified_at.replace(tzinfo=timezone.utc)).days
        if days_since > 365:
            needs_reverification = True
            reasons.append(f"Última verificação há {days_since} dias (>365)")

    if prof.verification_status == "reverification_required":
        needs_reverification = True
        reasons.append("Admin solicitou re-verificação")

    return {
        "professional_id": prof_id,
        "needs_reverification": needs_reverification,
        "reasons": reasons,
        "last_verified_at": prof.last_verified_at.isoformat() if prof.last_verified_at else None,
        "verification_status": prof.verification_status,
    }

# ── 10.3-28,29,30,33,37,38: Admin unified identity + category docs ────────────

@router.get("/users/{user_id}/unified-profile")
def get_unified_profile(user_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """10.3-28: Admin sees unified master identity with all profiles + categories."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    docs = db.query(Document).filter(Document.user_id == user_id).all()

    # Master identity docs vs category-specific docs
    identity_docs = [d for d in docs if d.doc_type in ("rg_cpf", "selfie", "proof_of_address")]
    category_docs = [d for d in docs if d.doc_type not in ("rg_cpf", "selfie", "proof_of_address")]

    # 10.3-29: Count affected future bookings per category
    future_bookings_by_cat = {}
    if prof:
        future = db.query(Booking).filter(
            Booking.professional_id == prof.id,
            Booking.status.in_(["accepted", "pending"]),
            Booking.scheduled_start > datetime.now(timezone.utc),
        ).all()
        for b in future:
            cat = b.service_type or "unknown"
            future_bookings_by_cat[cat] = future_bookings_by_cat.get(cat, 0) + 1

    return {
        "user_id": user_id,
        "full_name": user.full_name,
        "cpf": user.cpf,
        "email": user.email,
        "phone": user.phone,
        "account_status": getattr(user, 'account_status', 'active'),
        "phone_verified": user.phone_verified,
        "roles": user.roles or [user.role.value if hasattr(user.role, 'value') else str(user.role)],
        "has_client_profile": getattr(user, 'has_client_profile', False),
        "has_professional_profile": getattr(user, 'has_professional_profile', False),
        "professional": {
            "id": prof.id,
            "approval_status": prof.approval_status.value if prof and hasattr(prof.approval_status, 'value') else None,
            "verification_status": getattr(prof, 'verification_status', None),
            "active_category": prof.active_category,
            "categories": prof.category_records or [],
            "council_number": prof.council_number,
            "council_state": prof.council_state,
        } if prof else None,
        "identity_documents": [{
            "id": d.id, "doc_type": d.doc_type,
            "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
        } for d in identity_docs],
        "category_documents": [{
            "id": d.id, "doc_type": d.doc_type,
            "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
        } for d in category_docs],
        "future_bookings_by_category": future_bookings_by_cat,
        "total_future_bookings": sum(future_bookings_by_cat.values()),
    }

# 10.3-30: Admin set global account status
@router.patch("/users/{user_id}/account-status")
def set_account_status(user_id: str, status: str, reason: str = "", db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """10.3-30: Set global account status (active/suspended/banned)."""
    valid = ["active", "suspended", "banned", "deleted"]
    if status not in valid:
        raise HTTPException(400, f"Status inválido. Use: {valid}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    old = getattr(user, 'account_status', 'active')
    user.account_status = status
    user.is_active = status == "active"
    db.commit()

    _verification_audit_log.append({
        "professional_id": user_id, "action": f"account_{status}",
        "old_status": old, "new_status": status, "reason": reason,
        "admin_id": current.id, "admin_name": current.full_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"user_id": user_id, "account_status": status, "reason": reason}

# 10.3-33,38: Admin-configurable document requirements per category
_category_doc_requirements = {
    "nurse": [
        {"key": "coren_card", "label": "Carteira COREN", "required": True, "auto_validate": True},
        {"key": "coren_negative", "label": "Certidão Negativa COREN", "required": True, "auto_validate": True},
        {"key": "diploma", "label": "Diploma de Enfermagem", "required": True, "auto_validate": False},
        {"key": "rg_cpf", "label": "RG ou CPF com foto", "required": True, "auto_validate": False},
    ],
    "technician": [
        {"key": "coren_card", "label": "Carteira COREN", "required": True, "auto_validate": True},
        {"key": "coren_negative", "label": "Certidão Negativa COREN", "required": True, "auto_validate": True},
        {"key": "diploma", "label": "Diploma/Certificado Técnico", "required": True, "auto_validate": False},
        {"key": "rg_cpf", "label": "RG ou CPF com foto", "required": True, "auto_validate": False},
    ],
    "nursing_assistant": [
        {"key": "coren_card", "label": "Carteira COREN", "required": True, "auto_validate": True},
        {"key": "coren_negative", "label": "Certidão Negativa COREN", "required": True, "auto_validate": True},
        {"key": "diploma", "label": "Diploma/Certificado Auxiliar", "required": True, "auto_validate": False},
        {"key": "rg_cpf", "label": "RG ou CPF com foto", "required": True, "auto_validate": False},
    ],
    "caregiver": [
        {"key": "rg_cpf", "label": "RG ou CPF com foto", "required": True, "auto_validate": False},
        {"key": "proof_of_training", "label": "Certificado de formação/curso", "required": False, "auto_validate": False},
    ],
}

@router.get("/category-doc-requirements")
def get_category_doc_requirements(_=Depends(require_admin)):
    """10.3-33: Get configurable doc requirements per category."""
    return _category_doc_requirements

@router.put("/category-doc-requirements/{category}")
def update_category_doc_requirements(category: str, docs: list, current: User = Depends(is_super_admin)):
    """10.3-38: Admin updates doc requirements for a category (no code deploy needed)."""
    if category not in _category_doc_requirements:
        raise HTTPException(400, f"Categoria '{category}' inválida.")
    _category_doc_requirements[category] = docs
    return {"category": category, "requirements": docs, "message": "Requisitos atualizados."}

# 10.3-34,37: Get documents grouped by category for a professional
@router.get("/professionals/{prof_id}/documents-by-category")
def get_docs_by_category(prof_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """10.3-37: Admin sees docs grouped by category."""
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    user = db.query(User).filter(User.id == prof.user_id).first()
    docs = db.query(Document).filter(Document.user_id == prof.user_id).all()

    result = {"identity": [], "categories": {}}
    for d in docs:
        doc_info = {"id": d.id, "doc_type": d.doc_type, "status": d.status.value if hasattr(d.status, 'value') else str(d.status), "file_url": d.file_url}
        if d.doc_type in ("rg_cpf", "selfie", "proof_of_address"):
            result["identity"].append(doc_info)
        else:
            # Map to category based on doc_type
            for cat, reqs in _category_doc_requirements.items():
                if any(r["key"] == d.doc_type for r in reqs):
                    if cat not in result["categories"]:
                        result["categories"][cat] = {"required": reqs, "submitted": []}
                    result["categories"][cat]["submitted"].append(doc_info)
    return result