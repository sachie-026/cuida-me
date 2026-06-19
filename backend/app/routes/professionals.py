from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.models import Professional, DocStatus
from app.utils.pricing import (
    professional_can_perform, minimum_role_for_services,
    SERVICES_BY_ROLE, calculate_price, VALID_MARKUPS
)

router = APIRouter(prefix="/professionals", tags=["professionals"])

class ProfessionalUpdate(BaseModel):
    council_number:   Optional[str]       = None
    council_state:    Optional[str]       = None
    services_offered: Optional[List[str]] = None
    service_radius:   Optional[int]       = None
    city:             Optional[str]       = None
    state:            Optional[str]       = None
    markup_pct:       Optional[int]       = None
    is_available:     Optional[bool]      = None

class PriceCalcRequest(BaseModel):
    role:           str
    duration_hours: int
    shift:          str
    markup_pct:     int   = 0
    is_urgent:      bool  = False
    is_holiday:     bool  = False
    distance_km:    float = 0.0

def get_or_create_profile(db: Session, user_id: str) -> Professional:
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        prof = Professional(
            user_id=user_id,
            approval_status=DocStatus.pending,
            is_available=False,
            services_offered=[],
            markup_pct=0,
        )
        db.add(prof)
        db.commit()
        db.refresh(prof)
    return prof

@router.get("/services")
def get_services_catalog():
    return SERVICES_BY_ROLE

@router.post("/calculate-price")
def calculate_booking_price(body: PriceCalcRequest):
    try:
        return calculate_price(
            role=body.role,
            duration_hours=body.duration_hours,
            shift=body.shift,
            markup_pct=body.markup_pct,
            is_urgent=body.is_urgent,
            is_holiday=body.is_holiday,
            distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.get("/nearby")
def get_nearby(
    lat:      float = -23.55,
    lng:      float = -46.63,
    radius:   int   = 50,
    services: Optional[str] = None,
    db:       Session = Depends(get_db)
):
    required_services = [s.strip() for s in services.split(",")] if services else []
    professionals = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available    == True,
    ).all()

    if required_services:
        min_role = minimum_role_for_services(required_services)
        if min_role is None:
            raise HTTPException(400, "One or more requested services are not recognised")
        from app.models.models import User
        filtered = []
        for prof in professionals:
            user = db.query(User).filter(User.id == prof.user_id).first()
            if not user: continue
            role = user.role.value if hasattr(user.role, 'value') else str(user.role)
            prof_services = prof.services_offered or []
            if professional_can_perform(role, required_services) and \
               any(s in prof_services for s in required_services):
                filtered.append(prof)
        professionals = filtered

    return {"professionals": professionals, "count": len(professionals)}

@router.patch("/{user_id}/toggle-availability")
def toggle_availability(user_id: str, db: Session = Depends(get_db)):
    prof = get_or_create_profile(db, user_id)
    if prof.approval_status != DocStatus.approved:
        raise HTTPException(403, "ACCOUNT_NOT_VERIFIED")
    prof.is_available = not prof.is_available
    db.commit()
    return {"is_available": prof.is_available}

@router.put("/{user_id}")
def update_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db)):
    prof = get_or_create_profile(db, user_id)
    data = body.dict(exclude_unset=True)
    if "markup_pct" in data and data["markup_pct"] not in VALID_MARKUPS:
        raise HTTPException(400, f"markup_pct must be one of {VALID_MARKUPS}")
    if data.get("is_available") == True and prof.approval_status != DocStatus.approved:
        data.pop("is_available")
    for k, v in data.items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof

@router.patch("/{user_id}")
def patch_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db)):
    return update_professional(user_id, body, db)

@router.get("/{user_id}")
def get_professional(user_id: str, db: Session = Depends(get_db)):
    return get_or_create_profile(db, user_id)