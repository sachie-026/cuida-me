"""
Professional Availability Calendar
====================================
Professionals set recurring weekly slots and specific date overrides.
System checks availability when clients browse professionals.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Availability, AvailabilityType, Booking, BookingStatus, Professional, User
from app.utils.holidays import check_date_for_holiday

router = APIRouter(prefix="/availability", tags=["availability"])

DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


def _is_overnight(start_time: str, end_time: str) -> bool:
    """Check if a slot crosses midnight (e.g. 19:00 → 07:00)."""
    return start_time > end_time


def _slot_covers_request(slot_start_str: str, slot_end_str: str, date_str: str,
                         req_start: datetime, req_end: datetime) -> bool:
    """Check if an availability slot covers the requested time window.
    Handles overnight slots (start_time > end_time) by extending end to next day.
    """
    slot_start = datetime.strptime(f"{date_str} {slot_start_str}", "%Y-%m-%d %H:%M")
    slot_end   = datetime.strptime(f"{date_str} {slot_end_str}",   "%Y-%m-%d %H:%M")
    # Overnight slot: end is on the next day
    if _is_overnight(slot_start_str, slot_end_str):
        slot_end += timedelta(days=1)
    return slot_start <= req_start and req_end <= slot_end

class SlotCreate(BaseModel):
    type:          str = "available"   # "available" | "blocked"
    is_recurring:  bool = False
    day_of_week:   Optional[int] = None    # 0=Mon … 6=Sun
    specific_date: Optional[str] = None   # "2026-07-01"
    start_time:    str                     # "08:00"
    end_time:      str                     # "18:00"
    notes:         Optional[str] = None

class SlotUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time:   Optional[str] = None
    notes:      Optional[str] = None
    type:       Optional[str] = None

def _get_prof_or_403(user_id: str, db: Session, current: User) -> Professional:
    """Write guard — owner or admin only."""
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    if current.id != user_id and role != "admin":
        raise HTTPException(403, "Access denied")
    return prof

def _get_prof_or_404(user_id: str, db: Session) -> Professional:
    """Read guard — any authenticated user can read."""
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    return prof

# ── Professional manages own availability ─────────────────────────────────────

@router.get("/professional/{user_id}")
def get_availability(user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Get all availability slots for a professional. Readable by any authenticated user."""
    prof = _get_prof_or_404(user_id, db)
    slots = db.query(Availability).filter(Availability.professional_id == prof.id).all()
    return {
        "slots": slots,
        "recurring": [s for s in slots if s.is_recurring],
        "specific":  [s for s in slots if not s.is_recurring],
    }

@router.post("/professional/{user_id}", status_code=201)
def add_slot(user_id: str, body: SlotCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Add an availability or blocked slot."""
    prof = _get_prof_or_403(user_id, db, current)

    # Validate
    if body.is_recurring and body.day_of_week is None:
        raise HTTPException(400, "day_of_week required for recurring slots")
    if not body.is_recurring and not body.specific_date:
        raise HTTPException(400, "specific_date required for non-recurring slots")
    if body.day_of_week is not None and not 0 <= body.day_of_week <= 6:
        raise HTTPException(400, "day_of_week must be 0 (Mon) to 6 (Sun)")

    slot = Availability(
        professional_id=prof.id,
        type=AvailabilityType(body.type),
        is_recurring=body.is_recurring,
        day_of_week=body.day_of_week,
        specific_date=body.specific_date,
        start_time=body.start_time,
        end_time=body.end_time,
        notes=body.notes,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot

@router.patch("/slots/{slot_id}")
def update_slot(slot_id: str, body: SlotUpdate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    slot = db.query(Availability).filter(Availability.id == slot_id).first()
    if not slot:
        raise HTTPException(404, "Slot not found")
    # Verify ownership
    prof = db.query(Professional).filter(Professional.id == slot.professional_id).first()
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    if prof.user_id != current.id and role != "admin":
        raise HTTPException(403, "Access denied")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(slot, k, v)
    db.commit()
    db.refresh(slot)
    return slot

@router.delete("/slots/{slot_id}", status_code=204)
def delete_slot(slot_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    slot = db.query(Availability).filter(Availability.id == slot_id).first()
    if not slot:
        raise HTTPException(404, "Slot not found")
    prof = db.query(Professional).filter(Professional.id == slot.professional_id).first()
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    if prof.user_id != current.id and role != "admin":
        raise HTTPException(403, "Access denied")
    db.delete(slot)
    db.commit()

# ── Client checks available slots ─────────────────────────────────────────────

@router.get("/check/{professional_id}")
def check_availability(
    professional_id: str,
    date:            str,   # "2026-07-15"
    start_time:      str,   # "08:00"
    duration_hours:  int,
    db:              Session = Depends(get_db),
    current:         User   = Depends(get_current_user),
):
    """
    Check if a professional is available for a specific date/time/duration.
    Returns: {available, reason, is_holiday, holiday_name}
    """
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    # Check holiday
    holiday_info = check_date_for_holiday(date, db)

    # Parse times
    try:
        d = datetime.strptime(f"{date} {start_time}", "%Y-%m-%d %H:%M")
        end_dt = d + timedelta(hours=duration_hours)
        day_of_week = d.weekday()  # 0=Mon
    except ValueError:
        raise HTTPException(400, "Invalid date or time format")

    # Check recurring availability for this day of week
    recurring_slots = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.is_recurring     == True,
        Availability.day_of_week      == day_of_week,
        Availability.type             == AvailabilityType.available,
    ).all()

    # Check specific date override (blocked takes priority)
    specific_blocked = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.specific_date   == date,
        Availability.type            == AvailabilityType.blocked,
    ).first()

    if specific_blocked:
        return {
            "available": False,
            "reason": "Profissional bloqueou esta data",
            **holiday_info,
        }

    # Check if time falls within a recurring available slot (supports overnight)
    slot_covers = False
    for slot in recurring_slots:
        if _slot_covers_request(slot.start_time, slot.end_time, date, d, end_dt):
            slot_covers = True
            break

    # Also check previous day's overnight recurring slots that extend into this date
    if not slot_covers:
        prev_day = (day_of_week - 1) % 7
        prev_date_obj = d.date() - timedelta(days=1)
        prev_recurring = db.query(Availability).filter(
            Availability.professional_id == professional_id,
            Availability.is_recurring     == True,
            Availability.day_of_week      == prev_day,
            Availability.type             == AvailabilityType.available,
        ).all()
        for slot in prev_recurring:
            if _is_overnight(slot.start_time, slot.end_time):
                if _slot_covers_request(slot.start_time, slot.end_time,
                                        prev_date_obj.isoformat(), d, end_dt):
                    slot_covers = True
                    break

    # Also check specific date available override
    specific_available = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.specific_date   == date,
        Availability.type            == AvailabilityType.available,
    ).all()
    for sa in specific_available:
        if _slot_covers_request(sa.start_time, sa.end_time, date, d, end_dt):
            slot_covers = True
            break

    # Check previous day's specific overnight slot
    if not slot_covers:
        prev_date_str = (d.date() - timedelta(days=1)).isoformat()
        prev_specific = db.query(Availability).filter(
            Availability.professional_id == professional_id,
            Availability.specific_date   == prev_date_str,
            Availability.type            == AvailabilityType.available,
        ).all()
        for sa in prev_specific:
            if _is_overnight(sa.start_time, sa.end_time):
                if _slot_covers_request(sa.start_time, sa.end_time, prev_date_str, d, end_dt):
                    slot_covers = True
                    break

    if not slot_covers and not specific_available:
        return {
            "available": False,
            "reason": "Fora do horário disponível do profissional",
            **holiday_info,
        }

    # Check for existing bookings (double-booking prevention)
    existing = db.query(Booking).filter(
        Booking.professional_id == professional_id,
        Booking.status.in_([BookingStatus.accepted, BookingStatus.checked_in]),
        Booking.scheduled_start < end_dt,
        Booking.scheduled_end   > d,
    ).first()

    if existing:
        return {
            "available": False,
            "reason": "Profissional já tem agendamento neste horário",
            **holiday_info,
        }

    return {
        "available":    True,
        "reason":       None,
        **holiday_info,
    }

@router.get("/slots-for-date/{professional_id}")
def get_slots_for_date(
    professional_id: str,
    date:            str,
    db:              Session = Depends(get_db),
    current:         User   = Depends(get_current_user),
):
    """Return available time windows for a professional on a specific date."""
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    try:
        d = datetime.strptime(date, "%Y-%m-%d")
        day_of_week = d.weekday()
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    holiday_info = check_date_for_holiday(date, db)

    # Get recurring slots for this weekday
    recurring = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.is_recurring    == True,
        Availability.day_of_week     == day_of_week,
    ).all()

    # Get specific date overrides
    specific = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.specific_date   == date,
    ).all()

    # Blocked slots take full priority
    blocked_specific = [s for s in specific if s.type == AvailabilityType.blocked]
    if blocked_specific:
        return {"slots": [], "blocked": True, **holiday_info}

    available_slots = [
        {"start_time": s.start_time, "end_time": s.end_time, "source": "recurring",
         "overnight": _is_overnight(s.start_time, s.end_time)}
        for s in recurring if s.type == AvailabilityType.available
    ]
    available_slots += [
        {"start_time": s.start_time, "end_time": s.end_time, "source": "specific",
         "overnight": _is_overnight(s.start_time, s.end_time)}
        for s in specific if s.type == AvailabilityType.available
    ]

    # Include previous day's overnight slots that extend into this date
    prev_day = (day_of_week - 1) % 7
    prev_recurring = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.is_recurring    == True,
        Availability.day_of_week     == prev_day,
        Availability.type            == AvailabilityType.available,
    ).all()
    for s in prev_recurring:
        if _is_overnight(s.start_time, s.end_time):
            available_slots.append({
                "start_time": "00:00", "end_time": s.end_time,
                "source": "recurring_overnight", "overnight": True,
            })

    prev_date_str = (d.date() - timedelta(days=1)).isoformat() if hasattr(d, 'date') else (datetime.strptime(date, "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
    prev_specific = db.query(Availability).filter(
        Availability.professional_id == professional_id,
        Availability.specific_date   == prev_date_str,
        Availability.type            == AvailabilityType.available,
    ).all()
    for s in prev_specific:
        if _is_overnight(s.start_time, s.end_time):
            available_slots.append({
                "start_time": "00:00", "end_time": s.end_time,
                "source": "specific_overnight", "overnight": True,
            })

    return {"slots": available_slots, "blocked": False, **holiday_info}