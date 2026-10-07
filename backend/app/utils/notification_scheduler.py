"""
Scheduled Notification Runner
==============================
Processes notification_schedules entries and fires them at the right time.

Scheduled notifications use offset_minutes relative to a reference point:
  - "booking_start": minutes before/after booking.scheduled_start
  - "event": minutes after the original event was fired

Runner is called periodically (e.g. every 5 minutes) to check for pending scheduled notifications.
"""
import threading
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import (
    Booking,
    BookingStatus,
    Notification,
    NotificationSchedule,
    NotificationRule,
    NotificationEvent,
    NotificationDelivery,
    User,
    Professional,
)
from app.utils.notification_engine import fill_template


# Track which (schedule_id, booking_id) pairs we've already processed
_processed_cache: set = set()

# Maximum cache size before we trim old entries
_MAX_CACHE = 10000


def _get_booking_variables(booking: Booking, db: Session) -> dict:
    """Build template variables from a booking."""
    # Look up client user
    client_user = db.query(User).filter(User.id == booking.user_id).first()
    client_name = client_user.full_name if client_user else "Cliente"

    # Look up professional user
    pro_user = None
    pro_name = "Profissional"
    if booking.professional_id:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if pro:
            pro_user = db.query(User).filter(User.id == pro.user_id).first()
            pro_name = pro_user.full_name if pro_user else "Profissional"

    booking_date = ""
    booking_time = ""
    if booking.scheduled_start:
        booking_date = booking.scheduled_start.strftime("%d/%m")
        booking_time = booking.scheduled_start.strftime("%Hh")
        if booking.scheduled_end:
            booking_time += f"–{booking.scheduled_end.strftime('%Hh')}"

    return {
        "client_name": client_name,
        "professional_name": pro_name,
        "service": booking.service_type or "Cuidado",
        "booking_date": booking_date,
        "booking_time": booking_time,
        "booking_code": f"#{booking.id[:6].upper()}",
        "booking_id": booking.id,
    }, client_user, pro_user


def _create_scheduled_notification(
    db: Session,
    user: User,
    rule: NotificationRule,
    event: NotificationEvent,
    variables: dict,
):
    """Create a notification from a scheduled rule."""
    # Find in_app template
    in_app_tpl = None
    email_tpl = None
    for t in rule.templates:
        if t.channel == "in_app":
            in_app_tpl = t
        elif t.channel == "email":
            email_tpl = t

    if not in_app_tpl:
        return None

    title = fill_template(in_app_tpl.title, variables)
    body = fill_template(in_app_tpl.body, variables)

    # Deduplicate
    existing = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.event_key == event.event_key,
        Notification.booking_id == variables.get("booking_id"),
    ).first()
    if existing:
        return None

    notif = Notification(
        user_id=user.id,
        notification_type=event.category,
        event_key=event.event_key,
        category=event.category,
        title=title,
        message=body,
        priority=rule.priority,
        action_link=rule.action_link,
        is_mandatory=rule.is_mandatory,
        booking_id=variables.get("booking_id"),
        delivery_in_app="sent",
        delivery_email="pending",
        delivery_whatsapp="pending",
    )
    db.add(notif)
    db.flush()

    db.add(NotificationDelivery(
        notification_id=notif.id,
        channel="in_app",
        status="sent",
        attempts=1,
        last_attempt_at=datetime.now(timezone.utc),
    ))

    # Email if enabled
    if "email" in (rule.channels or []) and email_tpl:
        from app.utils.notification_engine import _send_email_notification
        _send_email_notification(db, notif, user, email_tpl, variables)

    return notif


def run_scheduled_notifications():
    """
    Check all active schedules and fire notifications that are due.
    Called periodically by the background thread.
    """
    global _processed_cache

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Get all active schedules
        schedules = db.query(NotificationSchedule).filter(
            NotificationSchedule.is_active == True,
        ).all()

        if not schedules:
            return

        for schedule in schedules:
            rule = schedule.rule
            if not rule or not rule.is_active:
                continue

            event = rule.event
            if not event:
                continue

            # For booking_start reference: find bookings that match the offset window
            if schedule.reference == "booking_start":
                _process_booking_start_schedule(db, schedule, rule, event, now)

        db.commit()

    except Exception as e:
        print(f"[SCHEDULER] Error: {e}")
        db.rollback()
    finally:
        db.close()

    # Trim cache if too large
    if len(_processed_cache) > _MAX_CACHE:
        _processed_cache = set()


def _process_booking_start_schedule(
    db: Session,
    schedule: NotificationSchedule,
    rule: NotificationRule,
    event: NotificationEvent,
    now: datetime,
):
    """Process schedules relative to booking.scheduled_start."""
    global _processed_cache

    # offset_minutes is negative for "before" (e.g. -1440 = 24h before)
    # The target fire time is: booking.scheduled_start + offset_minutes
    # We fire if that target time is in the past (within last 10 minutes window)
    window_start = now - timedelta(minutes=10)

    # Find accepted bookings whose (scheduled_start + offset) falls in [window_start, now]
    bookings = db.query(Booking).filter(
        Booking.status == BookingStatus.accepted,
        Booking.scheduled_start.isnot(None),
    ).all()

    for booking in bookings:
        cache_key = (schedule.id, booking.id)
        if cache_key in _processed_cache:
            continue

        target_time = booking.scheduled_start + timedelta(minutes=schedule.offset_minutes)

        # Make timezone-aware if needed
        if target_time.tzinfo is None:
            target_time = target_time.replace(tzinfo=timezone.utc)

        if window_start <= target_time <= now:
            variables, client_user, pro_user = _get_booking_variables(booking, db)

            # Resolve recipients based on rule
            recipient = rule.recipient.lower()
            users_to_notify = []
            if recipient == "client" and client_user:
                users_to_notify = [client_user]
            elif recipient == "professional" and pro_user:
                users_to_notify = [pro_user]
            elif recipient == "both":
                if client_user:
                    users_to_notify.append(client_user)
                if pro_user:
                    users_to_notify.append(pro_user)

            for user in users_to_notify:
                _create_scheduled_notification(db, user, rule, event, variables)

            _processed_cache.add(cache_key)


# ── Background thread ────────────────────────────────────────────────────────

_scheduler_thread = None
_scheduler_stop = threading.Event()

INTERVAL_SECONDS = 300  # 5 minutes


def _scheduler_loop():
    """Background loop that runs scheduled notifications."""
    print("[SCHEDULER] Background thread started (interval=5min)")
    while not _scheduler_stop.is_set():
        try:
            run_scheduled_notifications()
        except Exception as e:
            print(f"[SCHEDULER] Loop error: {e}")
        _scheduler_stop.wait(INTERVAL_SECONDS)
    print("[SCHEDULER] Background thread stopped")


def start_scheduler():
    """Start the background scheduler thread. Idempotent."""
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="notif-scheduler")
    _scheduler_thread.start()


def stop_scheduler():
    """Stop the background scheduler thread."""
    _scheduler_stop.set()
    if _scheduler_thread:
        _scheduler_thread.join(timeout=10)