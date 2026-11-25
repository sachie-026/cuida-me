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
from zoneinfo import ZoneInfo

# Bug fix (25/11/2026) — Booking scheduled_start / scheduled_end columns are
# stored as naive datetimes meant to be wall-clock Brazilian time (see the
# codebase-wide convention at bookings.py: "Scheduled times are treated as
# bare wall-clock Brazilian time throughout the app"). Comparing them to
# datetime.now(timezone.utc) with `.replace(tzinfo=timezone.utc)` was
# WRONG — it treated 09:00 as 09:00 UTC when it meant 09:00 São Paulo
# (12:00 UTC). On the no-show sweep this fired the auto-cancel 3 h too
# early. The helper below is the correct conversion for every comparison
# of a scheduled_* column against UTC now.
_TZ_SP = ZoneInfo("America/Sao_Paulo")

def _sched_to_utc(dt):
    """Scheduled times are naive wall-clock Brazilian time.
    Convert to tz-aware UTC so comparisons with datetime.now(timezone.utc)
    are correct. Returns None for None."""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=_TZ_SP).astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)
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
    resolved_action_link = fill_template(rule.action_link, variables) if rule.action_link else None

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
        action_link=resolved_action_link,
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

    # Phase B — late-arrival + auto-no-show enforcement. Separate DB sessions so
    # errors in one job don't poison the others.
    _run_late_arrival_sweep()
    _run_auto_no_show_sweep()
    _run_auto_finish_sweep()
    _run_extension_expiry_sweep()
    _run_finish_reminder_sweep()
    _run_finish_before_next_sweep()
    _run_payment_expiry_sweep()
    _run_response_expiry_sweep()

    # Trim cache if too large
    if len(_processed_cache) > _MAX_CACHE:
        _processed_cache = set()


def _run_late_arrival_sweep():
    """At scheduled_start + 15 min without check-in, flag the booking as
    late-arrival. Idempotent via the _processed_cache keyed by booking.id."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=15)
        # Only touch future-ended bookings (otherwise no-show sweep takes over)
        bookings = db.query(Booking).filter(
            Booking.status == BookingStatus.accepted,
            Booking.late_arrival == False,
            Booking.scheduled_start.isnot(None),
        ).all()
        for b in bookings:
            start = b.scheduled_start
            if getattr(start, "tzinfo", None) is None:
                start = start.replace(tzinfo=timezone.utc)
            if start > cutoff:
                continue  # 15 min hasn't elapsed yet
            end = b.scheduled_end
            if end and getattr(end, "tzinfo", None) is None:
                end = end.replace(tzinfo=timezone.utc)
            if end and end < now:
                continue  # already past service window — no-show sweep handles
            cache_key = ("late", b.id)
            if cache_key in _processed_cache:
                continue
            b.late_arrival = True
            b.late_arrival_count = (b.late_arrival_count or 0) + 1
            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                vars_ = {
                    "professional_name": pro_user.full_name if pro_user else "Profissional",
                    "service": b.service_type or "Cuidado",
                    "booking_code": f"#{b.id[:6].upper()}",
                    "booking_id": b.id,
                }
                recipients = {}
                if client_user: recipients["client"] = [client_user]
                if pro_user:    recipients["professional"] = [pro_user]
                if recipients:
                    fire_event(db, "service.late_arrival", vars_, recipient_users=recipients)
            except Exception as e:
                print(f"[LATE-ARRIVAL] notify failed for {b.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[LATE-ARRIVAL] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_auto_no_show_sweep():
    """Rule #1 (23/11/2026): a booking in `accepted` state at T+30 min past
    scheduled_start, without any check-in, is marked professional-no-show —
    client refunded, pro's no-show counter bumped (feeds progressive
    penalties), both sides notified. If the client has confirmed presence
    via /confirm-pro-presence (client_confirmed_pro_presence=True), the
    booking is skipped so the pro can still start under admin review.

    For legacy bookings sitting in `professional_arrived` (two-step check-in
    flow) we fall back to the older `scheduled_end` threshold — a pro who
    *did* arrive but never transitioned to checked_in isn't a strict
    no-show, and the service window being fully over is a clearer signal.
    """
    from app.models.models import Payment, PaymentStatus
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.status.in_([BookingStatus.accepted, BookingStatus.professional_arrived]),
            Booking.scheduled_start.isnot(None),
        ).all()
        for b in bookings:
            # Skip when the client has already unlocked a late start.
            if getattr(b, "client_confirmed_pro_presence", False):
                continue

            # Bug fix (25/11/2026) — scheduled_* are wall-clock Brazilian,
            # not UTC. Convert correctly or the sweep fires 3h too early.
            start = _sched_to_utc(b.scheduled_start)
            end   = _sched_to_utc(b.scheduled_end)

            status_val = b.status.value if hasattr(b.status, "value") else str(b.status)
            if status_val == "accepted":
                # Primary rule: T+30 min from scheduled_start without check-in.
                threshold = start + timedelta(minutes=30)
                if now < threshold:
                    continue
            else:  # professional_arrived — legacy fallback: scheduled_end
                if not end or now < end:
                    continue

            cache_key = ("noshow", b.id)
            if cache_key in _processed_cache:
                continue
            # Mark as no-show
            b.status = BookingStatus.no_show
            b.no_show_who = "professional"
            b.cancelled_at = now
            b.cancel_reason = (
                "Auto: profissional não compareceu (sem check-in até 30 min após o horário agendado)."
                if status_val == "accepted"
                else "Auto: profissional não compareceu (sem check-in até o fim do horário agendado)."
            )
            # Explicitly zero the pro payout — professional is not paid on no-show.
            b.pro_payout = 0.0
            # Bump pro's no-show counter
            if b.professional_id:
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
                if prof:
                    prof.no_shows = (prof.no_shows or 0) + 1
            # Full refund to client if a payment exists in escrow
            try:
                payment = db.query(Payment).filter(Payment.booking_id == b.id).first()
                if payment and payment.status in (PaymentStatus.held, PaymentStatus.authorized):
                    payment.status = PaymentStatus.refunded
                    payment.refund_amount = payment.amount
                    payment.refunded_at = now
            except Exception as pay_err:
                print(f"[NO-SHOW] refund mark failed for {b.id}: {pay_err}")
            # Notify both sides via existing event
            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                recipients = {}
                if client_user: recipients["client"] = [client_user]
                if pro_user:    recipients["professional"] = [pro_user]
                if recipients:
                    fire_event(db, "service.no_show_professional", {
                        "professional_name": pro_user.full_name if pro_user else "Profissional",
                        "service": b.service_type or "Cuidado",
                        "booking_code": f"#{b.id[:6].upper()}",
                        "booking_id": b.id,
                    }, recipient_users=recipients)
            except Exception as e:
                print(f"[NO-SHOW] notify failed for {b.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[NO-SHOW] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_auto_finish_sweep():
    """Rule (23/11/2026): a booking still in `checked_in` at scheduled_end
    + 30 min is auto-finished.
      - actual_checkout is set to scheduled_end (payment stays on the
        scheduled time — the 30-min grace is NOT paid extra time).
      - status → completed; review_type → "auto_finish" for admin triage.
      - Both sides are notified via service.auto_finished.
    An approved extension updates scheduled_end, so the cutoff moves with
    it automatically — no special case needed.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.status == BookingStatus.checked_in,
            Booking.scheduled_end.isnot(None),
        ).all()
        for b in bookings:
            # Bug fix (25/11/2026) — scheduled_* are wall-clock Brazilian.
            end = _sched_to_utc(b.scheduled_end)
            if end is None:
                continue
            threshold = end + timedelta(minutes=30)
            if now < threshold:
                continue
            cache_key = ("autofinish", b.id)
            if cache_key in _processed_cache:
                continue

            # Payment based on scheduled time — set actual_checkout exactly
            # to scheduled_end (not "now") so the duration-based duration
            # audit reflects the agreed service window. Keep the stored
            # value naive (matches the rest of the booking row).
            b.actual_checkout = b.scheduled_end
            b.status = BookingStatus.completed
            if b.actual_checkin:
                # actual_checkin is set via datetime.now(timezone.utc) in the
                # checkin handlers, so it IS UTC — not wall-clock. Use the
                # raw utc-aware form, not _sched_to_utc.
                checkin_val = b.actual_checkin
                if getattr(checkin_val, "tzinfo", None) is None:
                    checkin_val = checkin_val.replace(tzinfo=timezone.utc)
                b.actual_duration_minutes = max(0, round((end - checkin_val).total_seconds() / 60))
            # Flag for admin review — matches the review_type vocabulary
            # used elsewhere (checkouts via confirm-checkout do not set
            # this, so admin sees exactly the auto-finished ones).
            b.review_type = "auto_finish"

            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                vars_ = {
                    "professional_name": pro_user.full_name if pro_user else "Profissional",
                    "service": b.service_type or "Cuidado",
                    "booking_code": f"#{b.id[:6].upper()}",
                    "booking_id": b.id,
                }
                recipients = {}
                if client_user: recipients["client"] = [client_user]
                if pro_user:    recipients["professional"] = [pro_user]
                if recipients:
                    fire_event(db, "service.auto_finished", vars_, recipient_users=recipients)
            except Exception as e:
                print(f"[AUTO-FINISH] notify failed for {b.id}: {e}")

            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[AUTO-FINISH] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_extension_expiry_sweep():
    """Rule #5 (23/11/2026): a pending extension (status="requested") expires
    automatically when the booking's scheduled_end passes without the pro
    responding. Both sides are notified; the original schedule stays."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.extension_status == "requested",
            Booking.scheduled_end.isnot(None),
        ).all()
        for b in bookings:
            # Bug fix (25/11/2026) — scheduled_* are wall-clock Brazilian.
            end = _sched_to_utc(b.scheduled_end)
            if end is None or now < end:
                continue
            cache_key = ("extexpire", b.id)
            if cache_key in _processed_cache:
                continue
            b.extension_status = "expired"
            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                vars_ = {
                    "service": b.service_type or "Cuidado",
                    "booking_code": f"#{b.id[:6].upper()}",
                    "booking_id": b.id,
                }
                recipients = {}
                if client_user: recipients["client"] = [client_user]
                if pro_user:    recipients["professional"] = [pro_user]
                if recipients:
                    fire_event(db, "service.extension_expired", vars_, recipient_users=recipients)
            except Exception as e:
                print(f"[EXT-EXPIRY] notify failed for {b.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[EXT-EXPIRY] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_finish_reminder_sweep():
    """Rule #6 (23/11/2026) — at scheduled_end for a still-in-progress booking
    (status=checked_in), nudge the pro to finish in the app so payment can be
    released. Fires once per booking (cached by id). The hard auto-finish at
    scheduled_end+30 is handled separately by _run_auto_finish_sweep — this
    reminder is the soft nudge that precedes it."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.status == BookingStatus.checked_in,
            Booking.scheduled_end.isnot(None),
        ).all()
        for b in bookings:
            # Bug fix (25/11/2026) — scheduled_* are wall-clock Brazilian.
            end = _sched_to_utc(b.scheduled_end)
            if end is None or now < end:
                continue  # service hasn't reached its scheduled end yet
            cache_key = ("finishreminder", b.id)
            if cache_key in _processed_cache:
                continue
            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                if pro_user:
                    fire_event(db, "service.finish_reminder", {
                        "service": b.service_type or "Cuidado",
                        "booking_code": f"#{b.id[:6].upper()}",
                        "booking_id": b.id,
                        # Format the wall-clock scheduled end — the whole app treats
                        # these as wall-clock Brazilian time, no TZ conversion.
                        # Show wall-clock Brazilian time in the message.
                        "end_time": end.astimezone(_TZ_SP).strftime("%H:%M"),
                    }, recipient_users={"professional": [pro_user]})
            except Exception as e:
                print(f"[FINISH-REMINDER] notify failed for {b.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[FINISH-REMINDER] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_finish_before_next_sweep():
    """Rule #6 (23/11/2026) — when the pro's NEXT booking's scheduled_start is
    10 min away (or less) and the current booking is still in progress, nudge
    them to finish the current one first. The actual block happens later via
    the 409 "pro_busy" response and the "Finalizar anterior e iniciar?"
    dialog (Rule #3). This sweep is just the proactive reminder.

    Pairs are (current, next):
      current: status in (checked_in, professional_arrived) — in-progress
      next:    status in (accepted, pending) — not yet started by this pro
               scheduled_start between now and now + 10 min
    Cache key covers the pair so each threshold crossing fires once.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        window = now + timedelta(minutes=10)
        # Find all pros with at least one in-progress booking.
        in_progress = db.query(Booking).filter(
            Booking.status.in_([BookingStatus.checked_in, BookingStatus.professional_arrived]),
            Booking.professional_id.isnot(None),
        ).all()
        for cur in in_progress:
            # Is there a next booking of this pro starting within 10 min?
            upcoming = db.query(Booking).filter(
                Booking.professional_id == cur.professional_id,
                Booking.id != cur.id,
                Booking.status.in_([BookingStatus.accepted, BookingStatus.pending]),
                Booking.scheduled_start.isnot(None),
            ).all()
            next_near = None
            for nb in upcoming:
                # Bug fix (25/11/2026) — wall-clock Brazilian → UTC.
                s = _sched_to_utc(nb.scheduled_start)
                if s is None:
                    continue
                if now <= s <= window:
                    if next_near is None or s < next_near[1]:
                        next_near = (nb, s)
            if next_near is None:
                continue
            nb, start_dt = next_near
            cache_key = ("finishbeforenext", cur.id, nb.id)
            if cache_key in _processed_cache:
                continue
            try:
                from app.utils.notification_engine import fire_event
                prof = db.query(Professional).filter(Professional.id == cur.professional_id).first()
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                if pro_user:
                    fire_event(db, "service.finish_before_next", {
                        "service": cur.service_type or "Cuidado",
                        "booking_code": f"#{cur.id[:6].upper()}",
                        "booking_id": cur.id,
                        "next_service": nb.service_type or "Cuidado",
                        "next_booking_code": f"#{nb.id[:6].upper()}",
                        # Show wall-clock Brazilian time in the message.
                        "next_start_time": start_dt.astimezone(_TZ_SP).strftime("%H:%M"),
                    }, recipient_users={"professional": [pro_user]})
            except Exception as e:
                print(f"[FINISH-BEFORE-NEXT] notify failed for {cur.id} -> {nb.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[FINISH-BEFORE-NEXT] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_payment_expiry_sweep():
    """Item 10 (24/11/2026) — if the client hasn't paid by booking.payment_deadline,
    auto-cancel the booking, release the slot, and notify the client.
    Only touches accepted bookings with a deadline set and no held payment."""
    from app.models.models import Payment, PaymentStatus
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.status == BookingStatus.accepted,
            Booking.payment_deadline.isnot(None),
        ).all()
        for b in bookings:
            dl = b.payment_deadline
            if getattr(dl, "tzinfo", None) is None:
                dl = dl.replace(tzinfo=timezone.utc)
            if now < dl:
                continue
            # Check if payment already made (held/authorized) — if yes, skip.
            pay = db.query(Payment).filter(Payment.booking_id == b.id).first()
            if pay and pay.status in (PaymentStatus.held, PaymentStatus.authorized, PaymentStatus.released):
                # Clear the deadline so we don't recheck.
                b.payment_deadline = None
                continue
            cache_key = ("paymentexpire", b.id)
            if cache_key in _processed_cache:
                continue
            b.status = BookingStatus.cancelled
            b.cancelled_at = now
            b.cancelled_by = "system"
            b.cancel_reason = "Auto: cliente não concluiu o pagamento no prazo."
            try:
                from app.utils.notification_engine import fire_event
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                vars_ = {
                    "service": b.service_type or "Cuidado",
                    "booking_code": f"#{b.id[:6].upper()}",
                    "booking_id": b.id,
                }
                recipients = {}
                if client_user: recipients["client"] = [client_user]
                if pro_user:    recipients["professional"] = [pro_user]
                if recipients:
                    fire_event(db, "booking.payment_expired", vars_, recipient_users=recipients)
            except Exception as e:
                print(f"[PAYMENT-EXPIRE] notify failed for {b.id}: {e}")
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[PAYMENT-EXPIRE] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


def _run_response_expiry_sweep():
    """Item 10 (24/11/2026) — pending booking requests whose match_deadline
    passed without an accept. Mark the booking as expired (keeps as pending
    if rematch is possible, otherwise cancel), notify the client, and dock
    each matched pro's reliability score if they have crossed the configured
    rolling-window count threshold.

    This sweep complements the existing rematch flow (/smart-match/expire):
    the frontend calls that when the countdown hits 0 to immediately try the
    next batch. This sweep is the server-side safety net so expiries don't
    rely on a user being present."""
    from app.routes.settings import get_setting
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        bookings = db.query(Booking).filter(
            Booking.status == BookingStatus.pending,
            Booking.match_deadline.isnot(None),
        ).all()
        for b in bookings:
            dl = b.match_deadline
            if getattr(dl, "tzinfo", None) is None:
                dl = dl.replace(tzinfo=timezone.utc)
            if now < dl:
                continue
            cache_key = ("responseexpire", b.id, b.match_batch or 0)
            if cache_key in _processed_cache:
                continue
            # Dock reliability for each matched pro that ignored this round.
            try:
                reduction = int(get_setting("pro_expired_requests_score_reduction", db) or 5)
                threshold = int(get_setting("pro_expired_requests_count", db) or 3)
                window_d = int(get_setting("pro_expired_requests_window_days", db) or 30)
                for pid in (b.matched_pro_ids or []):
                    prof = db.query(Professional).filter(Professional.id == pid).first()
                    if not prof:
                        continue
                    # Count prior expirations where this pro was in the matched set.
                    # Rough heuristic: use a counter column if present, else an
                    # internal attribute on prof. The real rolling-window count
                    # is admin-visible via the audit table; here we just bump
                    # reliability_score once the user crosses the configured N.
                    prof.expired_requests_count = (getattr(prof, "expired_requests_count", 0) or 0) + 1
                    if prof.expired_requests_count >= threshold:
                        prof.reliability_score = max(0, (prof.reliability_score or 100) - reduction)
            except Exception as e:
                print(f"[RESPONSE-EXPIRE] score adjust failed for {b.id}: {e}")
            # Notify client with "others available or create an alert".
            try:
                from app.utils.notification_engine import fire_event
                client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
                if client_user:
                    fire_event(db, "booking.response_expired", {
                        "service": b.service_type or "Cuidado",
                        "booking_code": f"#{b.id[:6].upper()}",
                        "booking_id": b.id,
                    }, recipient_users={"client": [client_user]})
            except Exception as e:
                print(f"[RESPONSE-EXPIRE] notify failed for {b.id}: {e}")
            # Clear the deadline so this doesn't retrigger on every pass.
            b.match_deadline = None
            _processed_cache.add(cache_key)
        db.commit()
    except Exception as e:
        print(f"[RESPONSE-EXPIRE] sweep error: {e}")
        db.rollback()
    finally:
        db.close()


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