"""
Internal Messaging System
==========================
Allows patient ↔ professional communication within the platform.
Messages are tied to bookings for context.

TODO: Add WebSocket support for real-time messaging
TODO: Add push notifications when new message received
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import Message, User, Booking

router = APIRouter(prefix="/messages", tags=["messages"])

class MessageCreate(BaseModel):
    recipient_id: str
    content:      str
    booking_id:   Optional[str] = None

class MessageRead(BaseModel):
    message_ids: List[str]

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def send_message(body: MessageCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Send a message to another user."""
    if not body.content.strip():
        raise HTTPException(400, "Message content cannot be empty")
    if len(body.content) > 2000:
        raise HTTPException(400, "Message too long (max 2000 characters)")
    if current.id == body.recipient_id:
        raise HTTPException(400, "Cannot send message to yourself")

    # Verify recipient exists
    recipient = db.query(User).filter(User.id == body.recipient_id).first()
    if not recipient:
        raise HTTPException(404, "Recipient not found")

    # If booking_id provided, verify both users are part of it
    if body.booking_id:
        booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
        if not booking:
            raise HTTPException(404, "Booking not found")

    msg = Message(
        sender_id=current.id,
        recipient_id=body.recipient_id,
        booking_id=body.booking_id,
        content=body.content.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg

@router.get("/conversations")
def get_conversations(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Get list of all conversations for current user (latest message per contact)."""
    # Get all messages involving this user
    messages = db.query(Message).filter(
        or_(Message.sender_id == current.id, Message.recipient_id == current.id)
    ).order_by(Message.created_at.desc()).all()

    # Group by conversation partner
    seen = set()
    conversations = []
    for msg in messages:
        partner_id = msg.recipient_id if msg.sender_id == current.id else msg.sender_id
        if partner_id not in seen:
            seen.add(partner_id)
            partner = db.query(User).filter(User.id == partner_id).first()
            unread = db.query(Message).filter(
                Message.sender_id    == partner_id,
                Message.recipient_id == current.id,
                Message.is_read      == False,
            ).count()
            conversations.append({
                "partner_id":   partner_id,
                "partner_name": partner.full_name if partner else "—",
                "last_message": msg.content[:60] + ("..." if len(msg.content) > 60 else ""),
                "last_message_at": msg.created_at,
                "unread_count": unread,
                "booking_id":   msg.booking_id,
            })
    return conversations

@router.get("/thread/{partner_id}")
def get_thread(
    partner_id: str,
    booking_id: Optional[str] = None,
    skip:       int = 0,
    limit:      int = 50,
    db:         Session = Depends(get_db),
    current:    User    = Depends(get_current_user),
):
    """Get message thread between current user and a partner."""
    q = db.query(Message).filter(
        or_(
            and_(Message.sender_id == current.id, Message.recipient_id == partner_id),
            and_(Message.sender_id == partner_id, Message.recipient_id == current.id),
        )
    )
    if booking_id:
        q = q.filter(Message.booking_id == booking_id)

    messages = q.order_by(Message.created_at.desc()).offset(skip).limit(limit).all()

    # Mark received messages as read
    db.query(Message).filter(
        Message.sender_id    == partner_id,
        Message.recipient_id == current.id,
        Message.is_read      == False,
    ).update({"is_read": True})
    db.commit()

    return list(reversed(messages))

@router.get("/unread-count")
def get_unread_count(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    count = db.query(Message).filter(
        Message.recipient_id == current.id,
        Message.is_read      == False,
    ).count()
    return {"unread": count}

@router.patch("/read")
def mark_read(body: MessageRead, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Mark specific messages as read."""
    db.query(Message).filter(
        Message.id.in_(body.message_ids),
        Message.recipient_id == current.id,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"marked_read": len(body.message_ids)}