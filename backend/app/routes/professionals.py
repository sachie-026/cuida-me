from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import Professional, DocStatus

router = APIRouter(prefix="/professionals", tags=["professionals"])

class ProfessionalUpdate(BaseModel):
    council_number: Optional[str] = None
    council_state:  Optional[str] = None
    specialties:    Optional[List[str]] = None
    service_radius: Optional[int] = None
    city:           Optional[str] = None
    state:          Optional[str] = None
    hourly_rate:    Optional[float] = None
    is_available:   Optional[bool] = None

@router.get("/nearby")
def get_nearby(
    lat:    float = -23.55,
    lng:    float = -46.63,
    radius: int   = 50,
    db:     Session = Depends(get_db)
):
    """
    Returns only APPROVED and AVAILABLE professionals.
    Clients should never see pending/rejected professionals.
    """
    professionals = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available    == True,
    ).all()
    return {"professionals": professionals, "count": len(professionals)}

@router.patch("/{user_id}/toggle-availability")
def toggle_availability(user_id: str, db: Session = Depends(get_db)):
    """
    Toggle availability — only allowed if professional is approved.
    Returns error with redirect hint if not approved.
    """
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")

    # Block if not approved
    if prof.approval_status != DocStatus.approved:
        raise HTTPException(403, "ACCOUNT_NOT_VERIFIED")

    prof.is_available = not prof.is_available
    db.commit()
    return {"is_available": prof.is_available}

@router.put("/{user_id}")
def update_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        prof = Professional(user_id=user_id)
        db.add(prof)
    for k, v in body.dict(exclude_unset=True).items():
        # Block is_available toggle if not approved
        if k == "is_available" and v == True and prof.approval_status != DocStatus.approved:
            continue
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof

@router.get("/{user_id}")
def get_professional(user_id: str, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    return prof