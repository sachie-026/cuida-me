"""
In-App Notification System (DB-backed)
=======================================
Notification center with unread count, category filter, pagination,
booking grouping, and full event engine integration.
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import User, Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


def create_notification(
    user_id: str,
    type: str,
    title: str,
    message: str,
    booking_id: str = None,
    doc_id: str = None,
    doc_type: str = None,
    db: Session = None,
):
    """
    Helper to create a notification for a user (legacy callers).
    Prefer fire_event() from notification_engine for new code.
    """
    if db is not None:
        notif = Notification(
            user_id=user_id,
            notification_type=type,
            title=title,
            message=message,
            booking_id=booking_id,
            doc_id=doc_id,
            doc_type=doc_type,
            delivery_in_app="sent",
        )
        db.add(notif)
        return {
            "id": notif.id,
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
            "booking_id": booking_id,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        import uuid
        return {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
            "booking_id": booking_id,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }


def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "type": n.notification_type,
        "event_key": n.event_key,
        "category": n.category,
        "priority": n.priority,
        "title": n.title,
        "message": n.message,
        "read": n.read,
        "is_mandatory": n.is_mandatory,
        "action_link": n.action_link,
        "booking_id": n.booking_id,
        "doc_id": n.doc_id,
        "doc_type": n.doc_type,
        "delivery_email": n.delivery_email,
        "delivery_whatsapp": n.delivery_whatsapp,
        "delivery_in_app": n.delivery_in_app,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


# ── List with filters + pagination ──────────────────────────────────

@router.get("")
def get_notifications(
    category: Optional[str] = Query(None, description="Filter by category: account, booking, service, payment, rating, penalty, alert, admin, message"),
    unread_only: bool = Query(False, description="Show only unread notifications"),
    booking_id: Optional[str] = Query(None, description="Filter by booking_id"),
    priority: Optional[str] = Query(None, description="Filter by priority: urgent, high, normal, low"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """
    Get notifications for current user with optional filters.
    Returns { items, total, unread_count }.
    """
    q = db.query(Notification).filter(Notification.user_id == current.id)

    if category:
        q = q.filter(Notification.category == category)
    if unread_only:
        q = q.filter(Notification.read == False)
    if booking_id:
        q = q.filter(Notification.booking_id == booking_id)
    if priority:
        q = q.filter(Notification.priority == priority)

    total = q.count()

    notifs = (
        q.order_by(desc(Notification.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Unread count (unfiltered — always shows total unread)
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == current.id, Notification.read == False)
        .count()
    )

    return {
        "items": [_serialize(n) for n in notifs],
        "total": total,
        "unread_count": unread_count,
    }


# ── Unread count (lightweight) ──────────────────────────────────────

@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Get unread notification count + per-category breakdown."""
    total_unread = (
        db.query(Notification)
        .filter(Notification.user_id == current.id, Notification.read == False)
        .count()
    )

    # Per-category unread counts
    category_counts = (
        db.query(Notification.category, func.count(Notification.id))
        .filter(
            Notification.user_id == current.id,
            Notification.read == False,
        )
        .group_by(Notification.category)
        .all()
    )

    return {
        "unread_count": total_unread,
        "by_category": {cat or "general": count for cat, count in category_counts},
    }


# ── Booking-grouped notifications ──────────────────────────────────

@router.get("/by-booking/{booking_id}")
def get_notifications_by_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Get all notifications for a specific booking, grouped chronologically."""
    notifs = (
        db.query(Notification)
        .filter(
            Notification.user_id == current.id,
            Notification.booking_id == booking_id,
        )
        .order_by(Notification.created_at)
        .all()
    )
    return {
        "booking_id": booking_id,
        "count": len(notifs),
        "items": [_serialize(n) for n in notifs],
    }


# ── Category summary ────────────────────────────────────────────────

@router.get("/categories")
def get_notification_categories(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Get notification counts per category (total + unread)."""
    results = (
        db.query(
            Notification.category,
            func.count(Notification.id).label("total"),
            func.count(Notification.id).filter(Notification.read == False).label("unread"),
        )
        .filter(Notification.user_id == current.id)
        .group_by(Notification.category)
        .all()
    )
    return [
        {"category": cat or "general", "total": total, "unread": unread}
        for cat, total, unread in results
    ]


# ── Mark read / Mark all read ───────────────────────────────────────

@router.patch("/{notif_id}/read")
def mark_read(
    notif_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark a notification as read."""
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current.id,
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.read = True
    db.commit()
    return {"id": notif_id, "read": True}


@router.patch("/read-all")
def mark_all_read(
    category: Optional[str] = Query(None, description="Mark all read in a specific category only"),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark all notifications as read (optionally filtered by category)."""
    q = db.query(Notification).filter(
        Notification.user_id == current.id,
        Notification.read == False,
    )
    if category:
        q = q.filter(Notification.category == category)

    count = q.update({"read": True})
    db.commit()
    return {"marked": count}


# ── Delete ──────────────────────────────────────────────────────────

@router.delete("/{notif_id}")
def delete_notification(
    notif_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Delete a notification."""
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current.id,
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    db.delete(n)
    db.commit()
    return {"deleted": True}