from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.models.models import Assessment, Booking, Professional, BookingStatus
from sqlalchemy import func

router = APIRouter(prefix="/ratings", tags=["ratings"])

class RatingCreate(BaseModel):
    booking_id:  str
    reviewer_id: str
    reviewee_id: str  # accepts either user_id OR professional_id — we resolve below
    rating:      int
    comment:     Optional[str] = None

@router.post("/", status_code=201)
def create_rating(body: RatingCreate, db: Session = Depends(get_db)):
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")

    booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status != BookingStatus.completed:
        raise HTTPException(400, "Can only rate completed bookings")

    # Resolve professional_id → user_id if needed
    reviewee_user_id = body.reviewee_id
    prof = db.query(Professional).filter(Professional.id == body.reviewee_id).first()
    if prof:
        reviewee_user_id = prof.user_id

    existing = db.query(Assessment).filter(
        Assessment.booking_id  == body.booking_id,
        Assessment.reviewer_id == body.reviewer_id,
    ).first()
    if existing:
        raise HTTPException(400, "Already rated this booking")

    assessment = Assessment(
        booking_id=body.booking_id,
        reviewer_id=body.reviewer_id,
        reviewee_id=reviewee_user_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(assessment)

    # Update professional avg rating
    pro = db.query(Professional).filter(Professional.user_id == reviewee_user_id).first()
    if pro:
        result = db.query(func.avg(Assessment.rating), func.count(Assessment.id))\
            .filter(Assessment.reviewee_id == reviewee_user_id).first()
        pro.rating_avg   = round(float(result[0] or 0), 1)
        pro.rating_count = result[1]

    db.commit()
    db.refresh(assessment)
    return assessment

@router.get("/booking/{booking_id}")
def get_booking_ratings(booking_id: str, db: Session = Depends(get_db)):
    return db.query(Assessment).filter(Assessment.booking_id == booking_id).all()

@router.get("/professional/{user_id}")
def get_professional_ratings(user_id: str, db: Session = Depends(get_db)):
    return db.query(Assessment).filter(Assessment.reviewee_id == user_id).all()

@router.get("/user/{user_id}/given")
def get_ratings_given(user_id: str, db: Session = Depends(get_db)):
    return db.query(Assessment).filter(Assessment.reviewer_id == user_id).all()