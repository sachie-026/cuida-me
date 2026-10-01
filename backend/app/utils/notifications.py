"""
Multi-channel notification service.
Supports: in-app (DB-backed), email (SendGrid), WhatsApp (Twilio).
Stubs print to server log until real providers are configured.
Tracks delivery status per channel on the Notification row. Retries failed channels once.

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


def notify_all_channels(
    db,
    user,
    title: str,
    message: str,
    notif_type: str = "general",
    retry_failed: bool = True,
    doc_id: str = None,
    doc_type: str = None,
):
    """
    Send notification via all channels. Retries failed channels once.
    Creates a DB Notification row with delivery statuses.
    Returns delivery report dict.
    """
    from app.models.models import Notification

    # 1. Create DB notification (in-app channel)
    notif = Notification(
        user_id=user.id,
        notification_type=notif_type,
        title=title,
        message=message,
        doc_id=doc_id,
        doc_type=doc_type,
        delivery_in_app="sent",
        delivery_email="pending",
        delivery_whatsapp="pending",
    )
    db.add(notif)

    in_app_result = {"sent": True, "channel": "in_app"}

    # 2. Send email
    email_result = send_email(user.email, title, message)

    # 3. Send WhatsApp
    whatsapp_result = send_whatsapp(getattr(user, "phone", None), message)

    results = {
        "in_app": in_app_result,
        "email": email_result,
        "whatsapp": whatsapp_result,
    }

    # Retry failed channels once (skip not_configured / no_email / no_phone)
    skip_errors = ("not_configured", "no_email", "no_phone")
    failed = []
    for name, result in [("email", email_result), ("whatsapp", whatsapp_result)]:
        if not result.get("sent") and result.get("error") not in skip_errors:
            failed.append(name)

    if retry_failed and failed:
        time.sleep(1)
        for name in failed:
            if name == "email":
                retry = send_email(user.email, title, message)
            else:
                retry = send_whatsapp(getattr(user, "phone", None), message)
            retry["retried"] = True
            results[name] = retry
            print(f"[NOTIFY RETRY] {name}: {'OK' if retry.get('sent') else 'FAILED AGAIN'}")

    # 4. Update delivery statuses on the Notification row
    def _status(r):
        if r.get("sent"):
            return "sent"
        if r.get("error") in skip_errors:
            return "not_configured"
        return "failed"

    notif.delivery_email = _status(results["email"])
    notif.delivery_whatsapp = _status(results["whatsapp"])

    # Log delivery report
    summary = {k: v.get("sent", False) for k, v in results.items()}
    print(f"[NOTIFY] {user.email} — {summary}")

    # Store delivery status in audit log
    try:
        from app.models.models import DocumentAuditLog
        log = DocumentAuditLog(
            doc_id=doc_id or "notification",
            user_id=user.id,
            admin_id="system",
            admin_name="Sistema",
            action=f"notify_{notif_type}",
            doc_type=doc_type or "notification",
            reason=f"email:{notif.delivery_email} whatsapp:{notif.delivery_whatsapp} in_app:sent",
            feedback=title,
        )
        db.add(log)
    except Exception as e:
        print(f"[NOTIFY] Failed to log delivery: {e}")

    return results