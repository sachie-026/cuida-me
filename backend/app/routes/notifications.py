"""
2.2d / 2.3d: Multi-channel notification service.
Supports: in-app, email (SendGrid stub), WhatsApp (Twilio stub).
Stubs print to server log until real providers are configured.

To enable real email:
  1. pip install sendgrid
  2. Set SENDGRID_API_KEY env var
  3. Set SENDGRID_FROM_EMAIL env var

To enable real WhatsApp:
  1. pip install twilio
  2. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM env vars
"""
import os
from datetime import datetime, timezone


def send_email(to: str, subject: str, body: str) -> bool:
    """Send email. Uses SendGrid if configured, otherwise logs to console."""
    api_key = os.getenv("SENDGRID_API_KEY")
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@cuidau.com.br")

    if api_key:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(
                from_email=from_email,
                to_emails=to,
                subject=subject,
                plain_text_content=body,
            )
            sg = SendGridAPIClient(api_key)
            response = sg.send(message)
            print(f"[EMAIL] Sent to {to} — status {response.status_code}")
            return response.status_code in (200, 201, 202)
        except Exception as e:
            print(f"[EMAIL] SendGrid error: {e}")
            return False
    else:
        print(f"[EMAIL STUB] To: {to} | Subject: {subject} | Body: {body[:200]}")
        return False


def send_whatsapp(to: str, message: str) -> bool:
    """Send WhatsApp message. Uses Twilio if configured, otherwise logs to console."""
    sid = os.getenv("TWILIO_SID")
    token = os.getenv("TWILIO_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if sid and token:
        try:
            from twilio.rest import Client
            client = Client(sid, token)
            # Ensure 'to' has whatsapp: prefix
            to_wa = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
            msg = client.messages.create(body=message, from_=from_number, to=to_wa)
            print(f"[WHATSAPP] Sent to {to} — SID {msg.sid}")
            return True
        except Exception as e:
            print(f"[WHATSAPP] Twilio error: {e}")
            return False
    else:
        print(f"[WHATSAPP STUB] To: {to} | Message: {message[:200]}")
        return False


def send_in_app(db, user_id: str, title: str, message: str, notif_type: str = "general") -> bool:
    """Create in-app notification record."""
    try:
        from app.models.models import Notification
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notif_type,
        )
        db.add(notif)
        return True
    except Exception as e:
        print(f"[NOTIF] Failed: {e}")
        return False


def notify_all_channels(db, user, title: str, message: str, notif_type: str = "general"):
    """2.2d/2.3d: Send notification via all available channels — in-app, email, WhatsApp."""
    results = {
        "in_app": send_in_app(db, user.id, title, message, notif_type),
        "email": send_email(user.email, title, message) if user.email else False,
        "whatsapp": send_whatsapp(user.phone, message) if getattr(user, 'phone', None) else False,
    }
    print(f"[NOTIFY] {user.email} — in_app:{results['in_app']} email:{results['email']} whatsapp:{results['whatsapp']}")
    return results