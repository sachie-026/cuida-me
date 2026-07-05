from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Booking, BookingStatus, User, Professional, Patient, Payment, PaymentStatus
from app.utils.pricing import calculate_price, MINIMUM_PRICES, detect_shift
from app.utils.holidays import check_date_for_holiday

router = APIRouter(prefix="/bookings", tags=["bookings"])

class BookingCreate(BaseModel):
    patient_id:      str
    professional_id: str
    service_type:    str
    services:        List[str]     = []
    care_level:      Optional[int] = None
    duration_hours:  Optional[int] = None
    shift:           str           = "day"
    scheduled_start: datetime
    scheduled_end:   datetime
    is_urgent:       bool          = False
    is_holiday:      bool          = False
    distance_km:     float         = 0.0
    markup_pct:      int           = 0
    notes:           Optional[str] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

class CancelRequest(BaseModel):
    reason: Optional[str] = None

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

def _compute_price(body: BookingCreate, db: Session):
    if not body.duration_hours:
        return None
    prof = db.query(Professional).filter(Professional.id == body.professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    user = db.query(User).filter(User.id == prof.user_id).first()
    if not user:
        raise HTTPException(404, "Professional user not found")
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role not in MINIMUM_PRICES:
        return None
    # Auto-detect shift from scheduled start time (#9)
    shift = body.shift
    if body.scheduled_start:
        shift = detect_shift(body.scheduled_start.hour)
    try:
        return calculate_price(
            role=role, duration_hours=body.duration_hours,
            shift=shift, markup_pct=prof.markup_pct or 0,
            is_urgent=body.is_urgent, is_holiday=body.is_holiday,
            distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(400, f"Invalid booking parameters: {e}")

def _get_refund_policy(booking: Booking, cancelled_by: str) -> dict:
    """
    Point 5 — Cancellation refund rules:
    Patient: >24h = full refund, <24h = partial (50%), <6h = no refund
    Professional: platform records, repeated = suspension risk
    """
    now = datetime.now(timezone.utc)
    start = booking.scheduled_start
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    hours_until = (start - now).total_seconds() / 3600

    if cancelled_by == "professional":
        return {
            "refund_pct":    100,
            "refund_reason": "Cancelamento pelo profissional — reembolso integral ao cliente",
        }
    # Client cancellation
    if hours_until > 24:
        return {"refund_pct": 100, "refund_reason": "Cancelamento com mais de 24h de antecedência"}
    elif hours_until > 6:
        return {"refund_pct": 50, "refund_reason": "Cancelamento entre 6–24h — reembolso de 50%"}
    else:
        return {"refund_pct": 0, "refund_reason": "Cancelamento com menos de 6h — sem reembolso"}

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_booking(body: BookingCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")

    # Auto-detect holiday if not already set
    date_str = body.scheduled_start.strftime("%Y-%m-%d")
    holiday_info = check_date_for_holiday(date_str, db)
    is_holiday = body.is_holiday or holiday_info["is_holiday"]

    server_price = _compute_price(body, db)
    booking_data = body.dict()
    booking_data["is_holiday"] = is_holiday
    if server_price:
        booking_data.update({
            "total_price":  server_price["total"],
            "platform_fee": server_price["platform_fee"],
            "pro_payout":   server_price["pro_payout"],
            "base_price":   server_price["base_price"],
            "markup_pct":   server_price["markup_pct"],
            "surcharge_pct":server_price["surcharge_pct"],
        })

    booking = Booking(**booking_data)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    return b

@router.get("/patient/{patient_or_user_id}")
def get_patient_bookings(patient_or_user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    patient = db.query(Patient).filter(Patient.id == patient_or_user_id).first()
    if not patient:
        patient = db.query(Patient).filter(Patient.user_id == patient_or_user_id).first()
    if not patient: raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.patient_id == patient.id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.get("/professional/{professional_id}")
def get_professional_bookings(professional_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof: raise HTTPException(404, "Professional not found")
    if prof.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.professional_id == professional_id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")
    b.status = BookingStatus.accepted
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/checkin")
def checkin(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status = BookingStatus.checked_in
    b.actual_checkin = datetime.utcnow()
    b.checkin_lat = body.lat
    b.checkin_lng = body.lng
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/checkout")
def checkout(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status = BookingStatus.completed
    b.actual_checkout = datetime.utcnow()

    # #7 Mandatory rest: check consecutive hours for this professional
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    if prof:
        now = datetime.utcnow()
        recent = db.query(Booking).filter(
            Booking.professional_id == prof.id,
            Booking.status == BookingStatus.completed,
            Booking.actual_checkout != None,
            Booking.actual_checkout >= now - timedelta(hours=48),
        ).order_by(Booking.actual_checkout.desc()).all()

        total_hours = sum(
            ((rb.actual_checkout - rb.actual_checkin).total_seconds() / 3600)
            for rb in recent if rb.actual_checkin and rb.actual_checkout
        )
        if total_hours >= 24:
            prof.rest_until = now + timedelta(hours=11)

    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/cancel")
def cancel_booking(
    booking_id: str,
    body:        CancelRequest = CancelRequest(),
    db:          Session = Depends(get_db),
    current:     User    = Depends(get_current_user),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status == BookingStatus.completed:
        raise HTTPException(400, "Cannot cancel a completed booking")

    # Determine who is cancelling
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    cancelled_by = "professional" if (prof and prof.user_id == current.id) else "client"

    # Apply refund policy
    refund_policy = _get_refund_policy(b, cancelled_by)

    b.status       = BookingStatus.cancelled
    b.cancel_reason = body.reason
    b.cancelled_by  = cancelled_by
    b.cancelled_at  = datetime.utcnow()

    # Update payment if exists
    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if payment and payment.status == PaymentStatus.held:
        if refund_policy["refund_pct"] == 100:
            payment.status = PaymentStatus.refunded
            payment.refunded_at = datetime.utcnow()
            payment.refund_reason = refund_policy["refund_reason"]
        elif refund_policy["refund_pct"] == 0:
            # No refund — release to professional
            payment.status = PaymentStatus.released
            payment.released_at = datetime.utcnow()
        else:
            # Partial refund — mark for manual processing
            payment.status = PaymentStatus.refunded
            payment.refund_reason = f"Reembolso parcial {refund_policy['refund_pct']}% — {refund_policy['refund_reason']}"

    db.commit()
    db.refresh(b)
    return {**{c.key: getattr(b, c.key) for c in b.__table__.columns if c.key != "status"},
            "status": b.status.value,
            "refund_policy": refund_policy}