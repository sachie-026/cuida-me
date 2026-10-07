"""
Notification Event Engine
=========================
Event-driven notification system.
Code fires events → engine looks up rules → resolves recipients → fills templates → creates notifications.

Usage:
    from app.utils.notification_engine import fire_event
    fire_event(db, "booking.requested", {
        "client_name": "Maria Silva",
        "service": "Cuidador",
        "booking_date": "05/10",
        "booking_time": "14h–20h",
        "neighborhood": "Copacabana",
        "booking_code": "#A1234",
        "response_deadline": "3h",
    }, recipient_users={"professional": [pro_user]})
"""
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.models import (
    Notification,
    NotificationEvent,
    NotificationRule,
    NotificationTemplate,
    NotificationDelivery,
    User,
)


def fill_template(template: str, variables: Dict[str, str]) -> str:
    """
    Replace {{variable_name}} placeholders with values from the variables dict.
    Unknown variables are left as-is (engine blocks them on save in admin panel).
    """
    def _replace(match):
        key = match.group(1).strip()
        return str(variables.get(key, match.group(0)))
    return re.sub(r"\{\{(\s*\w+\s*)\}\}", _replace, template)


def _resolve_recipients(
    rule: NotificationRule,
    recipient_users: Dict[str, List[User]],
) -> List[User]:
    """
    Resolve which users get this notification based on the rule's recipient field.
    recipient_users maps role labels to User lists:
      {"client": [user1], "professional": [user2], "admin": [admin1, admin2], "other_party": [user3]}
    """
    recipient = rule.recipient.lower()

    if recipient == "both":
        users = []
        for key in ("client", "professional"):
            users.extend(recipient_users.get(key, []))
        return users
    elif recipient == "other_party":
        return recipient_users.get("other_party", [])
    elif recipient == "user":
        # "user" = whoever triggered the event (document owner, etc.)
        return recipient_users.get("user", [])
    else:
        return recipient_users.get(recipient, [])


def _create_notification_for_user(
    db: Session,
    user: User,
    rule: NotificationRule,
    event: NotificationEvent,
    variables: Dict[str, str],
) -> Optional[Notification]:
    """
    Create a single Notification row for one user, filling templates.
    Returns the created Notification or None if no in_app template found.
    """
    # Find in_app template (primary channel, always used)
    in_app_template = None
    email_template = None
    for t in rule.templates:
        if t.channel == "in_app":
            in_app_template = t
        elif t.channel == "email":
            email_template = t

    if not in_app_template:
        # No in-app template — skip (shouldn't happen with proper seed)
        print(f"[NOTIFY ENGINE] No in_app template for rule {rule.id} ({event.event_key})")
        return None

    title = fill_template(in_app_template.title, variables)
    body = fill_template(in_app_template.body, variables)

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
        doc_id=variables.get("doc_id"),
        doc_type=variables.get("doc_type"),
        delivery_in_app="sent",
        delivery_email="pending",
        delivery_whatsapp="pending",
    )
    db.add(notif)
    db.flush()  # get notif.id for deliveries

    # Log in-app delivery
    db.add(NotificationDelivery(
        notification_id=notif.id,
        channel="in_app",
        status="sent",
        attempts=1,
        last_attempt_at=datetime.now(timezone.utc),
    ))

    # Send email if channel is enabled and template exists
    if "email" in (rule.channels or []) and email_template:
        _send_email_notification(db, notif, user, email_template, variables)

    return notif


def _send_email_notification(
    db: Session,
    notif: Notification,
    user: User,
    template: NotificationTemplate,
    variables: Dict[str, str],
):
    """
    Send email notification. Creates delivery record.
    Uses the existing send_email() from notifications.py util.
    """
    from app.utils.notifications import send_email

    subject = fill_template(template.email_subject or template.title, variables)
    body = fill_template(template.body, variables)

    result = send_email(user.email, subject, body)

    status = "sent" if result.get("sent") else "failed"
    error = result.get("error") if not result.get("sent") else None

    notif.delivery_email = status

    db.add(NotificationDelivery(
        notification_id=notif.id,
        channel="email",
        status=status,
        attempts=1,
        last_attempt_at=datetime.now(timezone.utc),
        error=error,
    ))


def fire_event(
    db: Session,
    event_key: str,
    variables: Dict[str, str],
    recipient_users: Dict[str, List[User]],
) -> List[Notification]:
    """
    Fire a notification event. This is the main entry point.

    Args:
        db: SQLAlchemy session
        event_key: e.g. "booking.requested", "document.approved"
        variables: dict of template variables (e.g. {"client_name": "Maria", "booking_date": "05/10"})
        recipient_users: maps recipient types to User objects:
            {"client": [user], "professional": [pro_user], "admin": [admin1], "other_party": [other]}

    Returns:
        List of created Notification objects
    """
    # 1. Look up the event
    event = db.query(NotificationEvent).filter(
        NotificationEvent.event_key == event_key
    ).first()

    if not event:
        print(f"[NOTIFY ENGINE] Unknown event: {event_key}")
        return []

    # 2. Get all active rules for this event
    rules = db.query(NotificationRule).filter(
        NotificationRule.event_id == event.id,
        NotificationRule.is_active == True,
    ).all()

    if not rules:
        print(f"[NOTIFY ENGINE] No active rules for: {event_key}")
        return []

    # 3. For each rule, resolve recipients and create notifications
    created = []
    for rule in rules:
        # Skip scheduled rules — those are handled by the scheduler (Batch 4)
        if rule.schedules and any(s.is_active for s in rule.schedules):
            # Check if this is an "on event" rule (no offset) or scheduled
            has_immediate = not rule.schedules  # no schedules = immediate
            for s in rule.schedules:
                if s.offset_minutes == 0:
                    has_immediate = True
            if not has_immediate:
                continue  # skip — will be picked up by scheduler

        users = _resolve_recipients(rule, recipient_users)
        if not users:
            continue

        for user in users:
            # Deduplicate: same event + same user + same booking = skip
            if variables.get("booking_id"):
                existing = db.query(Notification).filter(
                    Notification.user_id == user.id,
                    Notification.event_key == event_key,
                    Notification.booking_id == variables["booking_id"],
                ).first()
                if existing:
                    continue

            notif = _create_notification_for_user(db, user, rule, event, variables)
            if notif:
                created.append(notif)

    if created:
        print(f"[NOTIFY ENGINE] {event_key} → {len(created)} notification(s) created")
    return created


def get_unread_count(db: Session, user_id: str) -> int:
    """Get count of unread notifications for a user."""
    return db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False,
    ).count()