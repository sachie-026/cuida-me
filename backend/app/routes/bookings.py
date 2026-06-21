from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Booking, BookingStatus, User, Professional, Patient
from app.utils.pricing import calculate_price, MINIMUM_PRICES

router = APIRouter(prefix="/bookings", tags=["bookings"])

PRICE_TOLERANCE = 1.0  # allow R$1 rounding difference

class BookingCreate(BaseModel):
    patient_id:      str
    professional_id: str
    service_type:    str
    services:        List[str]     = []
    duration_hours:  Optional[int] = None
    shift:           str           = "day"
    scheduled_start: datetime
    scheduled_end:   datetime
    is_urgent:       bool          = False
    is_holiday:      bool          = False
    distance_km:     float         = 0.0
    markup_pct:      int           = 0
    # Client-supplied prices — will be validated server-side
    total_price:     float
    platform_fee:    float
    pro_payout:      float
    notes:           Optional[str] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

def _check_booking_access(booking: Booking, current: User, db: Session):
    if current.role.value == "admin":
        return
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if patient and patient.user_id == current.id:
        return
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if prof and prof.user_id == current.id:
        return
    raise HTTPException(403, "Access denied")

def _validate_price(body: BookingCreate, db: Session):
    """
    Fix 3 — Recalculate price server-side and reject if client price doesn't match.
    Uses professional's role and markup from DB — client cannot manipulate price.
    """
    if not body.duration_hours:
        return  # no duration = no server-side check possible (legacy bookings)

    prof = db.query(Professional).filter(Professional.id == body.professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    user = db.query(User).filter(User.id == prof.user_id).first()
    if not user:
        raise HTTPException(404, "Professional user not found")

    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role not in MINIMUM_PRICES:
        return  # admin/client roles — skip price check

    try:
        server_price = calculate_price(
            role=role,
            duration_hours=body.duration_hours,
            shift=body.shift,
            markup_pct=prof.markup_pct or 0,  # use DB markup, not client-supplied
            is_urgent=body.is_urgent,
            is_holiday=body.is_holiday,
            distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(400, f"Invalid booking parameters: {e}")

    if abs(server_price["total"] - body.total_price) > PRICE_TOLERANCE:
        raise HTTPException(400,
            f"Price mismatch. Expected R${server_price['total']:.2f}, got R${body.total_price:.2f}. "
            f"Please recalculate the price."
        )

    # Return server-calculated values to use in DB
    return server_price

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_booking(body: BookingCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    # Verify patient belongs to this user
    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied — patient does not belong to you")

    # Fix 3 — validate and recalculate price server-side
    server_price = _validate_price(body, db)

    booking_data = body.dict()
    # Override with server-calculated prices if available
    if server_price:
        booking_data["total_price"]  = server_price["total"]
        booking_data["platform_fee"] = server_price["platform_fee"]
        booking_data["pro_payout"]   = server_price["pro_payout"]
        booking_data["base_price"]   = server_price["base_price"]
        booking_data["markup_pct"]   = server_price["markup_pct"]
        booking_data["surcharge_pct"]= server_price["surcharge_pct"]

    booking = Booking(**booking_data)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    return b

@router.get("/patient/{patient_or_user_id}")
def get_patient_bookings(patient_or_user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    # Fix 6 — accept either patient_id or user_id
    patient = db.query(Patient).filter(Patient.id == patient_or_user_id).first()
    if not patient:
        # Try looking up by user_id
        patient = db.query(Patient).filter(Patient.user_id == patient_or_user_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.patient_id == patient.id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.get("/professional/{professional_id}")
def get_professional_bookings(professional_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    if prof.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.professional_id == professional_id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")
    b.status = BookingStatus.accepted
    db.commit()
    db.refresh(b)
    return b  # Fix 9 — return full booking object

@router.patch("/{booking_id}/checkin")
def checkin(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status         = BookingStatus.checked_in
    b.actual_checkin = datetime.utcnow()
    b.checkin_lat    = body.lat
    b.checkin_lng    = body.lng
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/checkout")
def checkout(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status          = BookingStatus.completed
    b.actual_checkout = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/cancel")
def cancel_booking(booking_id: str, reason: Optional[str] = None, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status == BookingStatus.completed:
        raise HTTPException(400, "Cannot cancel a completed booking")
    b.status        = BookingStatus.cancelled
    b.cancel_reason = reason
    db.commit()
    db.refresh(b)
    return b