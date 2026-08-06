from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Assessment, Booking, Professional, BookingStatus, User
from sqlalchemy import func

router = APIRouter(prefix="/ratings", tags=["ratings"])

class RatingCreate(BaseModel):
    booking_id:     str
    reviewee_id:    Optional[str] = None  # auto-resolved from booking if not provided
    rating:         int
    comment:        Optional[str] = None
    tags:           list = []
    would_again:    Optional[str] = None  # "yes" | "no" | "maybe"
    evaluator_role: Optional[str] = None  # "client" | "professional"

@router.get("")
@router.get("/")
def list_ratings(
    reviewer_id: Optional[str] = None,
    reviewee_id: Optional[str] = None,
    db:          Session = Depends(get_db),
    current:     User    = Depends(get_current_user),
):
    q = db.query(Assessment)
    if current.role.value != "admin":
        q = q.filter(
            (Assessment.reviewer_id == current.id) |
            (Assessment.reviewee_id == current.id)
        )
        # #42: Only show reviews where both parties have submitted OR 7 days passed
        # For now, show own reviews always; others only if counter-review exists
    if reviewer_id:
        q = q.filter(Assessment.reviewer_id == reviewer_id)
    if reviewee_id:
        q = q.filter(Assessment.reviewee_id == reviewee_id)
    ratings = q.order_by(Assessment.created_at.desc()).all()

    # #42: Mark visibility — hide detailed review until both submitted
    result = []
    for r in ratings:
        data = {
            "id": r.id, "booking_id": r.booking_id, "reviewer_id": r.reviewer_id,
            "reviewee_id": r.reviewee_id, "rating": r.rating, "comment": r.comment,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        # Check if counter-review exists
        counter = db.query(Assessment).filter(
            Assessment.booking_id == r.booking_id,
            Assessment.reviewer_id == r.reviewee_id,
        ).first()
        booking = db.query(Booking).filter(Booking.id == r.booking_id).first()
        checkout = booking.actual_checkout if booking else None
        days_passed = (datetime.now(timezone.utc) - checkout.replace(tzinfo=timezone.utc)).days if checkout else 999

        if counter or days_passed >= 7 or r.reviewer_id == current.id or current.role.value == "admin":
            data["visible"] = True
        else:
            data["visible"] = False
            data["comment"] = None  # Hide comment until both reviewed
        result.append(data)
    return result

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_rating(body: RatingCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")

    booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status != BookingStatus.completed:
        raise HTTPException(400, "Can only rate completed bookings")

    # #42: 7-day evaluation window
    if booking.actual_checkout:
        checkout_time = booking.actual_checkout.replace(tzinfo=timezone.utc) if booking.actual_checkout.tzinfo is None else booking.actual_checkout
        days_since = (datetime.now(timezone.utc) - checkout_time).days
        if days_since > 7:
            raise HTTPException(400, "O prazo de 7 dias para avaliação expirou.")

    # Prevent duplicate rating from same reviewer for same booking
    existing = db.query(Assessment).filter(
        Assessment.booking_id == body.booking_id,
        Assessment.reviewer_id == current.id,
    ).first()
    if existing:
        raise HTTPException(400, "Você já avaliou este atendimento.")

    # Fix 2 — reviewer_id always from JWT, never from request body
    reviewer_id = current.id

    # Auto-resolve reviewee from booking if not provided
    if body.reviewee_id:
        reviewee_user_id = body.reviewee_id
        prof = db.query(Professional).filter(Professional.id == body.reviewee_id).first()
        if prof:
            reviewee_user_id = prof.user_id
    else:
        # Client evaluating pro → reviewee is the pro; Pro evaluating client → reviewee is the client
        if body.evaluator_role == "client" or current.role.value == "client":
            pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
            reviewee_user_id = pro.user_id if pro else booking.professional_id
        else:
            reviewee_user_id = booking.user_id

    # Prevent self-rating
    if reviewer_id == reviewee_user_id:
        raise HTTPException(400, "Cannot rate yourself")

    existing = db.query(Assessment).filter(
        Assessment.booking_id  == body.booking_id,
        Assessment.reviewer_id == reviewer_id,
    ).first()
    if existing:
        raise HTTPException(400, "Already rated this booking")

    assessment = Assessment(
        booking_id=body.booking_id,
        reviewer_id=reviewer_id,
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
def get_booking_ratings(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return db.query(Assessment).filter(Assessment.booking_id == booking_id).all()

@router.get("/professional/{user_id}")
def get_professional_ratings(user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return db.query(Assessment).filter(Assessment.reviewee_id == user_id).all()

@router.get("/user/{user_id}/given")
def get_ratings_given(user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if current.id != user_id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Assessment).filter(Assessment.reviewer_id == user_id).all()