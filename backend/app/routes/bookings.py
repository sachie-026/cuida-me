from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.models.models import Booking, BookingStatus

router = APIRouter(prefix="/bookings", tags=["bookings"])

class BookingCreate(BaseModel):
    patient_id:      str
    professional_id: str
    service_type:    str
    procedures:      List[str] = []
    scheduled_start: datetime
    scheduled_end:   datetime
    total_price:     float
    platform_fee:    float
    pro_payout:      float
    notes:           Optional[str] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

@router.post("/", status_code=201)
def create_booking(body: BookingCreate, db: Session = Depends(get_db)):
    booking = Booking(**body.dict())
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    return b

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    b.status = BookingStatus.accepted
    db.commit()
    return {"status": "accepted"}

@router.patch("/{booking_id}/checkin")
def checkin(booking_id: str, body: CheckInOut, db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    b.status = BookingStatus.checked_in
    b.actual_checkin = datetime.utcnow()
    b.checkin_lat = body.lat
    b.checkin_lng = body.lng
    db.commit()
    return {"status": "checked_in"}

@router.patch("/{booking_id}/checkout")
def checkout(booking_id: str, body: CheckInOut, db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    b.status = BookingStatus.completed
    b.actual_checkout = datetime.utcnow()
    db.commit()
    return {"status": "completed"}

@router.patch("/{booking_id}/cancel")
def cancel_booking(booking_id: str, reason: str, db: Session = Depends(get_db)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    b.status = BookingStatus.cancelled
    b.cancel_reason = reason
    db.commit()
    return {"status": "cancelled"}

@router.get("/patient/{patient_id}")
def get_patient_bookings(patient_id: str, db: Session = Depends(get_db)):
    return db.query(Booking).filter(Booking.patient_id == patient_id).all()

@router.get("/professional/{pro_id}")
def get_pro_bookings(pro_id: str, db: Session = Depends(get_db)):
    return db.query(Booking).filter(Booking.professional_id == pro_id).all()