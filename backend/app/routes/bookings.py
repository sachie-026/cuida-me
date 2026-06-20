from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Booking, BookingStatus, User

# redirect_slashes=False on the app means we must register BOTH with and without slash
router = APIRouter(prefix="/bookings", tags=["bookings"])

class BookingCreate(BaseModel):
    patient_id:      str
    professional_id: str
    service_type:    str
    services:        List[str]    = []
    duration_hours:  Optional[int] = None
    shift:           str           = "day"
    scheduled_start: datetime
    scheduled_end:   datetime
    is_urgent:       bool          = False
    is_holiday:      bool          = False
    distance_km:     float         = 0.0
    base_price:      Optional[float] = None
    markup_pct:      int           = 0
    surcharge_pct:   float         = 0.0
    total_price:     float
    platform_fee:    float
    pro_payout:      float
    notes:           Optional[str] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

def _check_booking_access(booking: Booking, current: User, db: Session):
    """Verify user can access this booking — must be client, professional, or admin."""
    if str(current.role) == "admin":
        return
    # Check if client owns this booking via patient
    from app.models.models import Patient
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if patient and patient.user_id == current.id:
        return
    # Check if professional owns this booking
    from app.models.models import Professional
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if prof and prof.user_id == current.id:
        return
    raise HTTPException(403, "Access denied")

# Fix 3: register both /bookings and /bookings/ to avoid 404 on missing trailing slash
@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_booking(body: BookingCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    booking = Booking(**body.dict())
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    return b

@router.get("/patient/{patient_id}")
def get_patient_bookings(patient_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    # Verify the patient belongs to this user (or admin)
    from app.models.models import Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(Booking.patient_id == patient_id).order_by(Booking.scheduled_start.desc()).all()

@router.get("/professional/{professional_id}")
def get_professional_bookings(professional_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    from app.models.models import Professional
    # Allow access if it's the professional themselves or admin
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    if prof.user_id != current.id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(Booking.professional_id == professional_id).order_by(Booking.scheduled_start.desc()).all()

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")
    b.status = BookingStatus.accepted
    db.commit()
    return b

@router.patch("/{booking_id}/checkin")
def checkin(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current=Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status         = BookingStatus.checked_in
    b.actual_checkin = datetime.utcnow()
    b.checkin_lat    = body.lat
    b.checkin_lng    = body.lng
    db.commit()
    return b

@router.patch("/{booking_id}/checkout")
def checkout(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current=Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status          = BookingStatus.completed
    b.actual_checkout = datetime.utcnow()
    db.commit()
    return b

@router.patch("/{booking_id}/cancel")
def cancel_booking(booking_id: str, reason: Optional[str] = None, db: Session = Depends(get_db), current=Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status == BookingStatus.completed:
        raise HTTPException(400, "Cannot cancel a completed booking")
    b.status        = BookingStatus.cancelled
    b.cancel_reason = reason
    db.commit()
    return b