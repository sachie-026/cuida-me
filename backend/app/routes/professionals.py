from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user, get_optional_user
from app.models.models import Professional, DocStatus, User
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

# Public endpoints (no auth needed — clients browse before login)
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
    db:       Session = Depends(get_db),
    current:  Optional[User] = Depends(get_optional_user),
):
    """Public endpoint — returns approved+available professionals, filtered by services if provided."""
    required_services = [s.strip() for s in services.split(",")] if services else []

    professionals = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available    == True,
    ).all()

    if required_services:
        min_role = minimum_role_for_services(required_services)
        if min_role is None:
            raise HTTPException(400, "One or more requested services are not recognised")
        filtered = []
        for prof in professionals:
            user = db.query(User).filter(User.id == prof.user_id).first()
            if not user:
                continue
            role = user.role.value if hasattr(user.role, 'value') else str(user.role)
            prof_services = prof.services_offered or []
            if professional_can_perform(role, required_services) and \
               any(s in prof_services for s in required_services):
                # Enrich with user data for display
                filtered.append({
                    **{c.key: getattr(prof, c.key) for c in prof.__table__.columns},
                    "full_name": user.full_name,
                    "role": role,
                })
        return {"professionals": filtered, "count": len(filtered)}

    # No service filter — enrich all with user data
    result = []
    for prof in professionals:
        user = db.query(User).filter(User.id == prof.user_id).first()
        if not user:
            continue
        role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        result.append({
            **{c.key: getattr(prof, c.key) for c in prof.__table__.columns},
            "full_name": user.full_name,
            "role": role,
        })
    return {"professionals": result, "count": len(result)}

# Authenticated endpoints
@router.patch("/{user_id}/toggle-availability")
def toggle_availability(user_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    if current.id != user_id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
    prof = get_or_create_profile(db, user_id)
    if prof.approval_status != DocStatus.approved:
        raise HTTPException(403, "ACCOUNT_NOT_VERIFIED")
    prof.is_available = not prof.is_available
    db.commit()
    return {"is_available": prof.is_available}

@router.put("/{user_id}")
def update_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    if current.id != user_id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
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
def patch_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    return update_professional(user_id, body, db, current)

@router.get("/{user_id}")
def get_professional(user_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    return get_or_create_profile(db, user_id)