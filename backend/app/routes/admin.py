from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, Professional, Booking, Payment, Document, Assessment, DocStatus, UserRole
from app.schemas.user import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {
        "total_users":         db.query(User).count(),
        "total_clients":       db.query(User).filter(User.role == UserRole.client).count(),
        "total_professionals": db.query(User).filter(User.role != UserRole.client, User.role != UserRole.admin).count(),
        "pending_approvals":   db.query(Professional).filter(Professional.approval_status == DocStatus.pending).count(),
        "total_bookings":      db.query(Booking).count(),
        "total_revenue":       db.query(Payment).filter(Payment.status == "paid").with_entities(
                                   __import__("sqlalchemy").func.sum(Payment.commission)).scalar() or 0,
    }

@router.get("/users")
def get_users(role: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    users = q.order_by(User.created_at.desc()).all()
    # Return safe user data without password_hash
    return [
        {
            "id": u.id, "email": u.email, "full_name": u.full_name,
            "phone": u.phone, "role": u.role, "is_active": u.is_active,
            "is_verified": u.is_verified, "created_at": u.created_at,
        }
        for u in users
    ]

@router.patch("/users/{user_id}/block")
def block_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "admin":
        raise HTTPException(400, "Cannot block admin users")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}

@router.get("/professionals")
def get_professionals(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Professional)
    if status:
        q = q.filter(Professional.approval_status == status)
    professionals = q.order_by(Professional.created_at.desc()).all()
    result = []
    for prof in professionals:
        user = db.query(User).filter(User.id == prof.user_id).first()
        docs = db.query(Document).filter(Document.user_id == prof.user_id).all()
        result.append({
            "id":              prof.id,
            "user_id":         prof.user_id,
            "full_name":       user.full_name if user else "—",
            "email":           user.email     if user else "—",
            "phone":           user.phone     if user else "—",
            "role":            user.role      if user else "—",
            "council_number":  prof.council_number,
            "council_state":   prof.council_state,
            "council_type":    prof.council_type,
            "city":            prof.city,
            "specialties":     prof.specialties,
            "hourly_rate":     prof.hourly_rate,
            "rating_avg":      prof.rating_avg,
            "rating_count":    prof.rating_count,
            "approval_status": prof.approval_status,
            "is_available":    prof.is_available,
            "documents": [
                {"doc_type": d.doc_type, "file_url": d.file_url, "status": d.status}
                for d in docs
            ],
        })
    return result

@router.patch("/professionals/{prof_id}/approve")
def approve_professional(prof_id: str, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.approved
    db.commit()
    return {"id": prof_id, "status": "approved"}

@router.patch("/professionals/{prof_id}/reject")
def reject_professional(prof_id: str, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.rejected
    prof.is_available = False  # force offline when rejected
    db.commit()
    return {"id": prof_id, "status": "rejected"}

@router.get("/bookings")
def get_bookings(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Booking)
    if status:
        q = q.filter(Booking.status == status)
    return q.order_by(Booking.created_at.desc()).all()

_commission = {"rate": 12.0}

@router.get("/commission")
def get_commission():
    return _commission

@router.put("/commission")
def update_commission(rate: Optional[float] = None, body: Optional[dict] = None, db: Session = Depends(get_db)):
    # Accept both query param and JSON body
    final_rate = rate
    if final_rate is None and body:
        final_rate = body.get("rate")
    if final_rate is None or not (0 < final_rate < 100):
        raise HTTPException(400, "Rate must be between 0 and 100")
    _commission["rate"] = final_rate
    return _commission