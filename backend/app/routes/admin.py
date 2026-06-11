from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import User, Professional, Booking, Payment, Document, Assessment, DocStatus, UserRole

router = APIRouter(prefix="/admin", tags=["admin"])

# ── Overview stats ──
@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {
        "total_users":         db.query(User).count(),
        "total_clients":       db.query(User).filter(User.role == UserRole.client).count(),
        "total_professionals": db.query(User).filter(User.role != UserRole.client).count(),
        "pending_approvals":   db.query(Professional).filter(Professional.approval_status == DocStatus.pending).count(),
        "total_bookings":      db.query(Booking).count(),
        "total_revenue":       db.query(Payment).filter(Payment.status == "paid").with_entities(
                                   __import__("sqlalchemy").func.sum(Payment.commission)).scalar() or 0,
    }

# ── Users ──
@router.get("/users")
def get_users(role: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return q.order_by(User.created_at.desc()).all()

@router.patch("/users/{user_id}/block")
def block_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(404, "User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"is_active": user.is_active}

# ── Professionals ──
@router.get("/professionals")
def get_professionals(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Professional)
    if status:
        q = q.filter(Professional.approval_status == status)
    return q.order_by(Professional.created_at.desc()).all()

@router.patch("/professionals/{prof_id}/approve")
def approve_professional(prof_id: str, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof: raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.approved
    db.commit()
    return {"status": "approved"}

@router.patch("/professionals/{prof_id}/reject")
def reject_professional(prof_id: str, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.id == prof_id).first()
    if not prof: raise HTTPException(404, "Professional not found")
    prof.approval_status = DocStatus.rejected
    db.commit()
    return {"status": "rejected"}

# ── Bookings ──
@router.get("/bookings")
def get_bookings(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Booking)
    if status:
        q = q.filter(Booking.status == status)
    return q.order_by(Booking.created_at.desc()).all()

# ── Commission settings (simple in-memory for now) ──
_commission = {"rate": 12.0}

@router.get("/commission")
def get_commission():
    return _commission

@router.put("/commission")
def update_commission(rate: float, db: Session = Depends(get_db)):
    if not 0 < rate < 100:
        raise HTTPException(400, "Rate must be between 0 and 100")
    _commission["rate"] = rate
    return _commission