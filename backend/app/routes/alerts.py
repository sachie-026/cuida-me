"""
Availability Alerts & Smart Matching
=====================================
Allows patients and professionals to receive notifications
when compatible opportunities become available.
"""
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import AvailabilityAlert, User, Professional, Booking, Availability, DocStatus
from app.utils.pricing import ROLE_RANK

router = APIRouter(prefix="/alerts", tags=["alerts"])

# ── Schemas ────────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    alert_type:             str  # "patient" or "professional"
    care_type:              Optional[str] = None
    services:               List[str] = []
    professional_category:  Optional[str] = None
    preferred_date:         Optional[str] = None
    preferred_time:         Optional[str] = None
    duration_hours:         Optional[int] = None
    city:                   Optional[str] = None
    state:                  Optional[str] = None
    radius_km:              int = 50

class AlertUpdate(BaseModel):
    care_type:              Optional[str] = None
    services:               Optional[List[str]] = None
    professional_category:  Optional[str] = None
    preferred_date:         Optional[str] = None
    preferred_time:         Optional[str] = None
    duration_hours:         Optional[int] = None
    city:                   Optional[str] = None
    state:                  Optional[str] = None
    radius_km:              Optional[int] = None

# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_alert(body: AlertCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if body.alert_type not in ("patient", "professional"):
        raise HTTPException(400, "alert_type must be 'patient' or 'professional'")

    # Auto-expire: if preferred_date is set, expire at end of that day
    expires = None
    if body.preferred_date:
        try:
            expires = datetime.strptime(body.preferred_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        except ValueError:
            pass

    alert = AvailabilityAlert(
        user_id=current.id,
        alert_type=body.alert_type,
        care_type=body.care_type,
        services=body.services,
        professional_category=body.professional_category,
        preferred_date=body.preferred_date,
        preferred_time=body.preferred_time,
        duration_hours=body.duration_hours,
        city=body.city,
        state=body.state,
        radius_km=body.radius_km,
        expires_at=expires,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return _serialize(alert)

@router.get("/")
def list_my_alerts(status: Optional[str] = None, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """List all alerts for the current user."""
    _expire_stale(current.id, db)
    q = db.query(AvailabilityAlert).filter(AvailabilityAlert.user_id == current.id)
    if status:
        q = q.filter(AvailabilityAlert.status == status)
    alerts = q.order_by(AvailabilityAlert.created_at.desc()).all()
    return [_serialize(a) for a in alerts]

@router.get("/{alert_id}")
def get_alert(alert_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    alert = _get_own_alert(alert_id, current.id, db)
    return _serialize(alert)

@router.patch("/{alert_id}")
def update_alert(alert_id: str, body: AlertUpdate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    alert = _get_own_alert(alert_id, current.id, db)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(alert, k, v)
    db.commit()
    db.refresh(alert)
    return _serialize(alert)

@router.patch("/{alert_id}/pause")
def pause_alert(alert_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    alert = _get_own_alert(alert_id, current.id, db)
    alert.status = "paused"
    db.commit()
    return {"id": alert_id, "status": "paused"}

@router.patch("/{alert_id}/resume")
def resume_alert(alert_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    alert = _get_own_alert(alert_id, current.id, db)
    alert.status = "active"
    db.commit()
    return {"id": alert_id, "status": "active"}

@router.delete("/{alert_id}", status_code=204)
def delete_alert(alert_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    alert = _get_own_alert(alert_id, current.id, db)
    db.delete(alert)
    db.commit()

# ── Smart Matching ─────────────────────────────────────────────────────────────

@router.get("/match/check")
def check_matches(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Check if any active alerts for the current user have new matches.
    Returns list of alerts with matching opportunities."""
    _expire_stale(current.id, db)
    active = db.query(AvailabilityAlert).filter(
        AvailabilityAlert.user_id == current.id,
        AvailabilityAlert.status == "active",
    ).all()

    results = []
    now = datetime.now(timezone.utc)

    for alert in active:
        if alert.alert_type == "patient":
            matches = _match_patient_alert(alert, db, now)
        else:
            matches = _match_professional_alert(alert, db, now)

        if matches:
            results.append({
                "alert": _serialize(alert),
                "matches": matches,
                "match_count": len(matches),
            })

    return {"alerts_with_matches": results, "total_matches": sum(r["match_count"] for r in results)}

@router.patch("/match/{alert_id}/confirm")
def confirm_match(alert_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Mark an alert as matched (user found what they needed)."""
    alert = _get_own_alert(alert_id, current.id, db)
    alert.status = "matched"
    alert.matched_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": alert_id, "status": "matched"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_own_alert(alert_id: str, user_id: str, db: Session) -> AvailabilityAlert:
    alert = db.query(AvailabilityAlert).filter(AvailabilityAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alert not found")
    if alert.user_id != user_id:
        raise HTTPException(403, "Access denied")
    return alert

def _expire_stale(user_id: str, db: Session):
    """Auto-expire alerts whose preferred_date has passed."""
    now = datetime.now(timezone.utc)
    stale = db.query(AvailabilityAlert).filter(
        AvailabilityAlert.user_id == user_id,
        AvailabilityAlert.status == "active",
        AvailabilityAlert.expires_at != None,
        AvailabilityAlert.expires_at < now,
    ).all()
    for a in stale:
        a.status = "expired"
    if stale:
        db.commit()

def _match_patient_alert(alert: AvailabilityAlert, db: Session, now: datetime) -> list:
    """Find professionals matching a patient's alert criteria."""
    q = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available == True,
    )

    # Filter by city
    if alert.city:
        q = q.filter(Professional.city == alert.city)

    # Filter by rest period
    pros = [p for p in q.all() if not p.rest_until or p.rest_until <= now]

    # Filter by professional category
    if alert.professional_category:
        required_rank = ROLE_RANK.get(alert.professional_category, 0)
        filtered = []
        for p in pros:
            user = db.query(User).filter(User.id == p.user_id).first()
            if user:
                pro_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
                if ROLE_RANK.get(pro_role, 0) >= required_rank:
                    filtered.append((p, pro_role))
        pros_with_role = filtered
    else:
        pros_with_role = []
        for p in pros:
            user = db.query(User).filter(User.id == p.user_id).first()
            role = user.role.value if user and hasattr(user.role, 'value') else "unknown"
            pros_with_role.append((p, role))

    # Filter by date availability
    matches = []
    for p, role in pros_with_role[:10]:  # Limit to 10 matches
        match = {
            "professional_id": p.id,
            "full_name": None,
            "role": role,
            "city": p.city,
            "rating_avg": p.rating_avg,
            "rating_count": p.rating_count,
        }
        user = db.query(User).filter(User.id == p.user_id).first()
        if user:
            match["full_name"] = user.full_name
        matches.append(match)

    return matches

def _match_professional_alert(alert: AvailabilityAlert, db: Session, now: datetime) -> list:
    """Find pending bookings matching a professional's alert criteria."""
    from app.models.models import BookingStatus
    q = db.query(Booking).filter(Booking.status == BookingStatus.pending)

    if alert.preferred_date:
        q = q.filter(Booking.scheduled_start >= alert.preferred_date)

    bookings = q.order_by(Booking.created_at.desc()).limit(10).all()

    matches = []
    for b in bookings:
        matches.append({
            "booking_id": b.id,
            "service_type": b.service_type,
            "scheduled_start": b.scheduled_start.isoformat() if b.scheduled_start else None,
            "scheduled_end": b.scheduled_end.isoformat() if b.scheduled_end else None,
            "duration_hours": b.duration_hours,
            "total_price": b.total_price,
        })

    return matches

def _serialize(alert: AvailabilityAlert) -> dict:
    return {
        "id": alert.id,
        "user_id": alert.user_id,
        "alert_type": alert.alert_type,
        "care_type": alert.care_type,
        "services": alert.services or [],
        "professional_category": alert.professional_category,
        "preferred_date": alert.preferred_date,
        "preferred_time": alert.preferred_time,
        "duration_hours": alert.duration_hours,
        "city": alert.city,
        "state": alert.state,
        "radius_km": alert.radius_km,
        "status": alert.status,
        "matched_at": alert.matched_at.isoformat() if alert.matched_at else None,
        "matched_id": alert.matched_id,
        "expires_at": alert.expires_at.isoformat() if alert.expires_at else None,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }