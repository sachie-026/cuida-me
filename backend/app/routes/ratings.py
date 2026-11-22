from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Assessment, Booking, Professional, BookingStatus, User


# ── Rating window helper ──────────────────────────────────────────────────────
# Per the in-app rating rule: once a booking is completed, the reviewer has an
# open window to rate the other party. That window stays open UNTIL the
# reviewer's next booking request, at which point it expires. There is no
# fixed day cap — if the user never books again, they keep the ability to
# rate the last completed booking indefinitely. This replaces the previous
# 7-day evaluation window.
def _rating_window_open(booking: Booking, current: User, db: Session) -> bool:
    """True iff `current` is still allowed to rate this completed booking.

    - Client side (reviewer == booking.user_id): window closes once the client
      has created ANY newer booking (created_at strictly greater than this
      booking's completion anchor).
    - Professional side (reviewer is the assigned pro): window closes once the
      pro has been assigned ANY newer booking.

    Completion anchor = actual_checkout → scheduled_end → created_at
    (first non-null). The anchor is never user-tunable; it's derived from the
    booking itself so the rule can't be gamed by editing timestamps client
    side.
    """
    # Determine which side of the booking the reviewer is on.
    side = None
    pro_id = None
    if booking.user_id and current.id == booking.user_id:
        side = "client"
    else:
        pro = db.query(Professional).filter(Professional.user_id == current.id).first()
        if pro and pro.id == booking.professional_id:
            side = "pro"
            pro_id = pro.id
    if side is None:
        return False  # reviewer isn't a party to this booking

    anchor = booking.actual_checkout or booking.scheduled_end or booking.created_at
    if anchor is None:
        return True  # cannot evaluate; be permissive rather than blocking

    q = db.query(Booking.id).filter(
        Booking.id != booking.id,
        Booking.created_at > anchor,
    )
    if side == "client":
        q = q.filter(Booking.user_id == current.id)
    else:
        q = q.filter(Booking.professional_id == pro_id)
    return q.first() is None
from sqlalchemy import func
from app.utils.notification_engine import fire_event

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

    # Rating window: open until the reviewer's next booking request (see
    # _rating_window_open docstring). Replaces the previous 7-day hard cap.
    if not _rating_window_open(booking, current, db):
        raise HTTPException(
            400,
            "O período para avaliar este atendimento já encerrou. "
            "A avaliação fica disponível somente até o seu próximo agendamento."
        )

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

    # ── Notify: rating.received → reviewee ──
    try:
        reviewee = db.query(User).filter(User.id == reviewee_user_id).first()
        if reviewee:
            fire_event(db, "rating.received", {
                "rater_name": current.full_name,
                "rating_value": str(body.rating),
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
            }, recipient_users={"other_party": [reviewee]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] rating.received error: {e}")

    # Return an explicit dict rather than the raw ORM object — the previous
    # `return assessment` would occasionally fail JSON serialization for
    # certain SQLAlchemy relationship states, which the frontend saw as a
    # silent 500 (toast was also broken because `rating_modal.submitted` key
    # was missing; that is fixed in Phase A).
    return {
        "id":          assessment.id,
        "booking_id":  assessment.booking_id,
        "reviewer_id": assessment.reviewer_id,
        "reviewee_id": assessment.reviewee_id,
        "rating":      assessment.rating,
        "comment":     assessment.comment,
        "created_at":  assessment.created_at.isoformat() if assessment.created_at else None,
    }

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