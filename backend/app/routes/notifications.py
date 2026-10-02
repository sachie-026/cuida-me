"""
In-App Notification System (DB-backed)
=======================================
Stores and serves notifications for all users using the Notification model.
Replaces the previous in-memory store — notifications survive server restarts.
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
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
    Helper to create a notification for a user.
    If db session is provided, adds to it (caller must commit).
    Otherwise creates an in-memory dict for backward compat with callers
    that don't pass db — but the record won't persist.
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
        # Fallback: return dict shape but nothing persisted
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
        "title": n.title,
        "message": n.message,
        "read": n.read,
        "booking_id": n.booking_id,
        "doc_id": n.doc_id,
        "doc_type": n.doc_type,
        "delivery_email": n.delivery_email,
        "delivery_whatsapp": n.delivery_whatsapp,
        "delivery_in_app": n.delivery_in_app,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Get all notifications for current user, newest first, max 50."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == current.id)
        .order_by(desc(Notification.created_at))
        .limit(50)
        .all()
    )
    return [_serialize(n) for n in notifs]


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
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark all notifications as read."""
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current.id, Notification.read == False)
        .update({"read": True})
    )
    db.commit()
    return {"marked": count}


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