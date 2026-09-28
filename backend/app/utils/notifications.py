"""
Multi-channel notification service.
Supports: in-app, email (SendGrid), WhatsApp (Twilio).
Stubs print to server log until real providers are configured.
Tracks delivery status per channel. Retries failed channels once.

To enable real email:
  1. pip install sendgrid
  2. Set SENDGRID_API_KEY + SENDGRID_FROM_EMAIL env vars

To enable real WhatsApp:
  1. pip install twilio
  2. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM env vars
"""
import os
import time
from datetime import datetime, timezone


def send_email(to: str, subject: str, body: str) -> dict:
    """Send email. Returns {sent, channel, error}."""
    if not to:
        return {"sent": False, "channel": "email", "error": "no_email"}
    api_key = os.getenv("SENDGRID_API_KEY")
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@cuidau.com.br")

    if api_key:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(from_email=from_email, to_emails=to, subject=subject, plain_text_content=body)
            sg = SendGridAPIClient(api_key)
            response = sg.send(message)
            ok = response.status_code in (200, 201, 202)
            print(f"[EMAIL] {'Sent' if ok else 'Failed'} to {to} — status {response.status_code}")
            return {"sent": ok, "channel": "email", "status_code": response.status_code}
        except Exception as e:
            print(f"[EMAIL] SendGrid error for {to}: {e}")
            return {"sent": False, "channel": "email", "error": str(e)}
    else:
        print(f"[EMAIL STUB] To: {to} | Subject: {subject} | Body: {body[:200]}")
        return {"sent": False, "channel": "email", "error": "not_configured"}


def send_whatsapp(to: str, message: str) -> dict:
    """Send WhatsApp message. Returns {sent, channel, error}."""
    if not to:
        return {"sent": False, "channel": "whatsapp", "error": "no_phone"}
    sid = os.getenv("TWILIO_SID")
    token = os.getenv("TWILIO_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if sid and token:
        try:
            from twilio.rest import Client
            client = Client(sid, token)
            to_wa = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
            msg = client.messages.create(body=message, from_=from_number, to=to_wa)
            print(f"[WHATSAPP] Sent to {to} — SID {msg.sid}")
            return {"sent": True, "channel": "whatsapp", "sid": msg.sid}
        except Exception as e:
            print(f"[WHATSAPP] Twilio error for {to}: {e}")
            return {"sent": False, "channel": "whatsapp", "error": str(e)}
    else:
        print(f"[WHATSAPP STUB] To: {to} | Message: {message[:200]}")
        return {"sent": False, "channel": "whatsapp", "error": "not_configured"}


def send_in_app(db, user_id: str, title: str, message: str, notif_type: str = "general") -> dict:
    """Create in-app notification record. Returns {sent, channel, error}."""
    try:
        from app.models.models import Notification
        notif = Notification(user_id=user_id, title=title, message=message, notification_type=notif_type)
        db.add(notif)
        return {"sent": True, "channel": "in_app"}
    except Exception as e:
        print(f"[NOTIF] Failed for {user_id}: {e}")
        return {"sent": False, "channel": "in_app", "error": str(e)}


def notify_all_channels(db, user, title: str, message: str, notif_type: str = "general", retry_failed: bool = True):
    """Send notification via all channels. Retries failed channels once. Returns delivery report."""
    channels = [
        ("in_app", lambda: send_in_app(db, user.id, title, message, notif_type)),
        ("email", lambda: send_email(user.email, title, message)),
        ("whatsapp", lambda: send_whatsapp(getattr(user, 'phone', None), message)),
    ]

    results = {}
    failed = []

    for name, fn in channels:
        result = fn()
        results[name] = result
        if not result.get("sent") and result.get("error") not in ("not_configured", "no_email", "no_phone"):
            failed.append((name, fn))

    # Retry failed channels once (skip not_configured)
    if retry_failed and failed:
        time.sleep(1)
        for name, fn in failed:
            retry_result = fn()
            retry_result["retried"] = True
            results[name] = retry_result
            print(f"[NOTIFY RETRY] {name}: {'OK' if retry_result.get('sent') else 'FAILED AGAIN'}")

    # Log delivery report
    summary = {k: v.get("sent", False) for k, v in results.items()}
    print(f"[NOTIFY] {user.email} — {summary}")

    # Store delivery status in audit log
    try:
        from app.models.models import DocumentAuditLog
        log = DocumentAuditLog(
            doc_id="notification", user_id=user.id,
            admin_id="system", admin_name="Sistema",
            action=f"notify_{notif_type}",
            doc_type="notification",
            reason=f"Channels: {summary}",
            feedback=title,
        )
        db.add(log)
    except Exception as e:
        print(f"[NOTIFY] Failed to log delivery: {e}")

    return results