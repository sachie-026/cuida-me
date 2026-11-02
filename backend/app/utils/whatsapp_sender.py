"""
WhatsApp Notification Sender
=============================
Utility to send WhatsApp notifications via provider API.
Currently stubbed — uncomment the API call when a WhatsApp provider is configured.

Supported providers (configure via WHATSAPP_PROVIDER env var):
  - "meta"   → Meta Cloud API (default)
  - "twilio" → Twilio WhatsApp API

Env vars needed:
  - WHATSAPP_PROVIDER      (optional, default "meta")
  - WHATSAPP_API_TOKEN     (provider API token)
  - WHATSAPP_PHONE_NUMBER  (sender phone number, e.g. "+5521999999999")
"""
import os
from typing import Dict, Optional


WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "meta")
WHATSAPP_API_TOKEN = os.getenv("WHATSAPP_API_TOKEN", "")
WHATSAPP_PHONE_NUMBER = os.getenv("WHATSAPP_PHONE_NUMBER", "")


def send_whatsapp_message(
    to_phone: str,
    message: str,
    subject: Optional[str] = None,
) -> Dict:
    """
    Send a WhatsApp text message to a phone number.

    Args:
        to_phone: Recipient phone number with country code (e.g. "+5521987654321")
        message: Message body text
        subject: Optional subject/header (used as bold prefix if supported)

    Returns:
        {"sent": True/False, "error": str or None, "provider": str}
    """
    if not to_phone:
        return {"sent": False, "error": "No phone number provided", "provider": WHATSAPP_PROVIDER}

    # Format message with subject header if provided
    full_message = f"*{subject}*\n\n{message}" if subject else message

    # ──────────────────────────────────────────────────────────────────────
    # TODO: Uncomment the block below when WhatsApp provider is configured.
    #       Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER env vars.
    # ──────────────────────────────────────────────────────────────────────

    # if not WHATSAPP_API_TOKEN:
    #     return {"sent": False, "error": "WHATSAPP_API_TOKEN not configured", "provider": WHATSAPP_PROVIDER}
    #
    # try:
    #     if WHATSAPP_PROVIDER == "twilio":
    #         result = _send_via_twilio(to_phone, full_message)
    #     else:
    #         result = _send_via_meta(to_phone, full_message)
    #     return result
    # except Exception as e:
    #     return {"sent": False, "error": str(e), "provider": WHATSAPP_PROVIDER}

    # Stub: log the message and return success (for development/testing)
    print(f"[WHATSAPP STUB] To: {to_phone} | Subject: {subject} | Message: {message[:80]}...")
    return {"sent": False, "error": "WhatsApp provider not configured yet (stub mode)", "provider": WHATSAPP_PROVIDER}


def _send_via_meta(to_phone: str, message: str) -> Dict:
    """Send via Meta Cloud API (graph.facebook.com)."""
    import requests

    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"

    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone.replace("+", ""),
        "type": "text",
        "text": {"body": message},
    }

    resp = requests.post(url, json=payload, headers={
        "Authorization": f"Bearer {WHATSAPP_API_TOKEN}",
        "Content-Type": "application/json",
    }, timeout=10)

    if resp.status_code == 200:
        return {"sent": True, "error": None, "provider": "meta", "response": resp.json()}
    else:
        return {"sent": False, "error": f"Meta API {resp.status_code}: {resp.text[:200]}", "provider": "meta"}


def _send_via_twilio(to_phone: str, message: str) -> Dict:
    """Send via Twilio WhatsApp API."""
    import requests

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = f"whatsapp:{WHATSAPP_PHONE_NUMBER}"
    to_number = f"whatsapp:{to_phone}"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    resp = requests.post(url, data={
        "From": from_number,
        "To": to_number,
        "Body": message,
    }, auth=(account_sid, auth_token), timeout=10)

    if resp.status_code in (200, 201):
        return {"sent": True, "error": None, "provider": "twilio", "response": resp.json()}
    else:
        return {"sent": False, "error": f"Twilio {resp.status_code}: {resp.text[:200]}", "provider": "twilio"}