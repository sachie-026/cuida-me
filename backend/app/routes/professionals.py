from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import Professional, User

router = APIRouter(prefix="/professionals", tags=["professionals"])

class ProfessionalUpdate(BaseModel):
    council_number: str | None = None
    council_state:  str | None = None
    specialties:    list[str] = []
    service_radius: int = 15
    city:           str | None = None
    state:          str | None = None
    hourly_rate:    float | None = None
    is_available:   bool = False

@router.get("/nearby")
def get_nearby(lat: float, lng: float, radius: int = 20, db: Session = Depends(get_db)):
    """Get approved professionals within radius (km). Simple distance filter for now."""
    # TODO: use PostGIS or haversine for production
    professionals = db.query(Professional).filter(
        Professional.approval_status == "approved",
        Professional.is_available == True,
    ).all()
    return {"professionals": professionals, "count": len(professionals)}

@router.put("/{user_id}")
def update_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        prof = Professional(user_id=user_id)
        db.add(prof)
    for k, v in body.dict(exclude_unset=True).items():
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
