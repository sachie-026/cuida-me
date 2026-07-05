from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import require_admin
from app.models.models import User, Professional, Booking, Payment, Document, DocStatus, UserRole
from app.utils.pricing import MINIMUM_PRICES, VALID_DURATIONS

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
    return MINIMUM_PRICES

@router.patch("/pricing/{role}/{duration}/{shift}")
def update_pricing(role: str, duration: int, shift: str, price: float, _=Depends(require_admin)):
    if role not in MINIMUM_PRICES:
        raise HTTPException(400, f"Invalid role. Must be: {list(MINIMUM_PRICES.keys())}")
    if duration not in VALID_DURATIONS:
        raise HTTPException(400, f"Invalid duration. Must be: {VALID_DURATIONS}")
    if shift not in ("day", "night"):
        raise HTTPException(400, "shift must be 'day' or 'night'")
    if price <= 0:
        raise HTTPException(400, "Price must be positive")
    MINIMUM_PRICES[role][duration][shift] = round(price, 2)
    return {"updated": True, "role": role, "duration": duration, "shift": shift, "price": price}
# ── Document Verification ─────────────────────────────────────────────────────

REQUIRED_DOCS = {"photo_id", "diploma", "criminal", "selfie"}

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

    # If any doc is rejected, professional stays/goes to pending
    prof = db.query(Professional).filter(Professional.user_id == doc.user_id).first()
    if prof and prof.approval_status == DocStatus.approved:
        prof.approval_status = DocStatus.pending
        db.commit()

    return {"id": doc_id, "status": "rejected", "reason": reason}

def _check_auto_approve(user_id: str, db: Session):
    """Auto-approve professional when ALL required docs are approved."""
    docs = db.query(Document).filter(Document.user_id == user_id).all()
    approved_types = {d.doc_type for d in docs if d.status == DocStatus.approved}
    if REQUIRED_DOCS.issubset(approved_types):
        prof = db.query(Professional).filter(Professional.user_id == user_id).first()
        if prof and prof.approval_status != DocStatus.approved:
            prof.approval_status = DocStatus.approved
            db.commit()