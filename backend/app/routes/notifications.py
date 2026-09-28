"""
In-App Notification System
===========================
Stores and serves notifications for all users.
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])

# In-memory store (production: use Notification model in DB)
_notifications = {}  # user_id -> [notification_dicts]
_next_id = [1]

def create_notification(user_id: str, type: str, title: str, message: str, booking_id: str = None):
    """Helper to create a notification for a user. Call from other routes."""
    if user_id not in _notifications:
        _notifications[user_id] = []
    notif = {
        "id": str(_next_id[0]),
        "user_id": user_id,
        "type": type,
        "title": title,
        "message": message,
        "booking_id": booking_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _next_id[0] += 1
    _notifications[user_id].insert(0, notif)
    # Keep max 50 per user
    _notifications[user_id] = _notifications[user_id][:50]
    return notif

@router.get("/")
def get_notifications(current: User = Depends(get_current_user)):
    """Get all notifications for current user."""
    return _notifications.get(current.id, [])

@router.patch("/{notif_id}/read")
def mark_read(notif_id: str, current: User = Depends(get_current_user)):
    """Mark a notification as read."""
    user_notifs = _notifications.get(current.id, [])
    for n in user_notifs:
        if n["id"] == notif_id:
            n["read"] = True
            return {"id": notif_id, "read": True}
    raise HTTPException(404, "Notification not found")

@router.patch("/read-all")
def mark_all_read(current: User = Depends(get_current_user)):
    """Mark all notifications as read."""
    user_notifs = _notifications.get(current.id, [])
    for n in user_notifs:
        n["read"] = True
    return {"marked": len(user_notifs)}

@router.delete("/{notif_id}")
def delete_notification(notif_id: str, current: User = Depends(get_current_user)):
    """Delete a notification."""
    user_notifs = _notifications.get(current.id, [])
    _notifications[current.id] = [n for n in user_notifs if n["id"] != notif_id]
    return {"deleted": True}