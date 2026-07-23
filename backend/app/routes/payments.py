"""
Payment System — Stripe Integration
=====================================
Escrow model: client pays → held → released after checkout + no disputes.
Supports PIX (via Stripe) and credit/debit card pre-authorization.
Stripe keys read from environment: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
"""
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Payment, PaymentStatus, Booking, BookingStatus, User, Patient

router = APIRouter(prefix="/payments", tags=["payments"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

def get_stripe():
    """Lazy-load stripe with API key."""
    if not STRIPE_SECRET_KEY:
        return None
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        return stripe
    except ImportError:
        return None

# ── Schemas ────────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    booking_id: str
    method:     str   # "pix" | "credit_card" | "debit_card"

class RefundRequest(BaseModel):
    booking_id: str
    reason:     Optional[str] = "Cancelamento do agendamento"
    percentage: int = 100  # 100, 50, or 0

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    """Return publishable key for frontend Stripe.js initialization."""
    return {"publishable_key": STRIPE_PUBLISHABLE_KEY}

@router.post("/initiate", status_code=201)
def initiate_payment(body: PaymentCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Initiate payment — creates Stripe PaymentIntent or PIX charge."""
    booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if not patient or (patient.user_id != current.id and current.role.value != "admin"):
        raise HTTPException(403, "Access denied")

    existing = db.query(Payment).filter(Payment.booking_id == body.booking_id).first()
    if existing and existing.status.value not in ("failed", "refunded"):
        raise HTTPException(400, "Pagamento já existe para este agendamento")

    if body.method not in ("pix", "credit_card", "debit_card"):
        raise HTTPException(400, "Método inválido. Use: pix, credit_card, debit_card")

    amount_brl = booking.total_price
    commission = round(amount_brl * 12 / 100, 2)
    pro_payout = round(amount_brl - commission, 2)

    payment = Payment(
        booking_id=body.booking_id,
        amount=amount_brl,
        commission=commission,
        pro_payout=pro_payout,
        currency="BRL",
        method=body.method,
        status=PaymentStatus.pending,
    )

    stripe = get_stripe()
    result = {"payment_id": None, "status": "pending"}

    if stripe:
        try:
            amount_cents = int(amount_brl * 100)
            if body.method == "pix":
                intent = stripe.PaymentIntent.create(
                    amount=amount_cents,
                    currency="brl",
                    payment_method_types=["pix"],
                    metadata={"booking_id": body.booking_id},
                )
                payment.stripe_intent_id = intent.id
                result["client_secret"] = intent.client_secret
                result["status"] = "awaiting_pix"
            else:
                # Credit/debit — capture_method=manual for pre-auth
                intent = stripe.PaymentIntent.create(
                    amount=amount_cents,
                    currency="brl",
                    payment_method_types=["card"],
                    capture_method="manual",
                    metadata={"booking_id": body.booking_id},
                )
                payment.stripe_intent_id = intent.id
                result["client_secret"] = intent.client_secret
                result["status"] = "awaiting_card"
        except Exception as e:
            payment.status = PaymentStatus.failed
            db.add(payment)
            db.commit()
            raise HTTPException(400, f"Erro Stripe: {str(e)}")
    else:
        # No Stripe configured — dev/mock mode
        result["message"] = "Modo desenvolvimento: Stripe não configurado. Pagamento simulado."
        result["mock"] = True
        if body.method == "pix":
            result["pix_code"] = f"00020126360014BR.GOV.BCB.PIX0114+5511999990000{payment.id[:6]}5204000053039865802BR"

    db.add(payment)
    db.commit()
    db.refresh(payment)

    result["payment_id"] = payment.id
    result["amount"] = amount_brl
    result["method"] = body.method
    result["publishable_key"] = STRIPE_PUBLISHABLE_KEY or None
    return result

@router.post("/confirm/{payment_id}")
def confirm_payment(payment_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Confirm payment received — moves to 'held' (escrow). Called by webhook or manually."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    if payment.status not in (PaymentStatus.pending,):
        raise HTTPException(400, f"Cannot confirm payment in '{payment.status.value}' state")

    payment.status = PaymentStatus.held
    payment.held_at = datetime.now(timezone.utc)
    db.commit()
    return {"payment_id": payment.id, "status": "held", "message": "Pagamento confirmado e em custódia."}

@router.post("/capture/{payment_id}")
def capture_payment(payment_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Capture a pre-authorized card payment (admin or auto after checkout)."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")

    stripe = get_stripe()
    if stripe and payment.stripe_intent_id:
        try:
            stripe.PaymentIntent.capture(payment.stripe_intent_id)
        except Exception as e:
            raise HTTPException(400, f"Erro ao capturar: {str(e)}")

    payment.status = PaymentStatus.held
    payment.held_at = datetime.now(timezone.utc)
    db.commit()
    return {"payment_id": payment.id, "status": "held"}

# ── #24: Payment Release ──────────────────────────────────────────────────────

@router.post("/release/{booking_id}")
def release_payment(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Release payment to professional after checkout + no disputes."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status != BookingStatus.completed:
        raise HTTPException(400, "Só é possível liberar pagamento de atendimentos concluídos")
    if booking.has_dispute:
        raise HTTPException(400, "Pagamento retido: há uma disputa aberta para este atendimento")

    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    if payment.status != PaymentStatus.held:
        raise HTTPException(400, f"Pagamento não está em custódia (status: {payment.status.value})")

    # In production: trigger Stripe Transfer to professional's connected account
    stripe = get_stripe()
    if stripe and payment.stripe_intent_id:
        # Stripe Connect transfer would go here
        pass

    payment.status = PaymentStatus.released
    payment.released_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "payment_id": payment.id, "status": "released",
        "pro_payout": payment.pro_payout, "commission": payment.commission,
        "message": "Pagamento liberado ao profissional.",
    }

# ── #11: Refunds ──────────────────────────────────────────────────────────────

@router.post("/refund")
def refund_payment(body: RefundRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Process refund based on cancellation policy: >12h=100%, 2-12h=50%, <2h=0%."""
    payment = db.query(Payment).filter(Payment.booking_id == body.booking_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    if payment.status.value in ("refunded", "failed"):
        raise HTTPException(400, "Pagamento já reembolsado ou falhou")

    if body.percentage == 0:
        return {"payment_id": payment.id, "refund_amount": 0, "message": "Sem reembolso conforme política de cancelamento."}

    refund_amount = round(payment.amount * body.percentage / 100, 2)

    stripe = get_stripe()
    if stripe and payment.stripe_intent_id:
        try:
            stripe.Refund.create(
                payment_intent=payment.stripe_intent_id,
                amount=int(refund_amount * 100),
                reason="requested_by_customer",
            )
        except Exception as e:
            raise HTTPException(400, f"Erro no reembolso: {str(e)}")

    payment.status = PaymentStatus.refunded
    payment.refunded_at = datetime.now(timezone.utc)
    payment.refund_amount = refund_amount
    db.commit()
    return {
        "payment_id": payment.id, "status": "refunded",
        "refund_amount": refund_amount, "percentage": body.percentage,
        "message": f"Reembolso de {body.percentage}% (R$ {refund_amount:.2f}) processado.",
    }

# ── Webhook ───────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events for async payment confirmation."""
    stripe = get_stripe()
    if not stripe:
        raise HTTPException(400, "Stripe not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        else:
            import json
            event = json.loads(payload)
    except Exception:
        raise HTTPException(400, "Invalid webhook")

    event_type = event.get("type", "")
    data_obj = event.get("data", {}).get("object", {})

    if event_type == "payment_intent.succeeded":
        intent_id = data_obj.get("id")
        payment = db.query(Payment).filter(Payment.stripe_intent_id == intent_id).first()
        if payment and payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.held
            payment.held_at = datetime.now(timezone.utc)
            db.commit()

    elif event_type == "payment_intent.payment_failed":
        intent_id = data_obj.get("id")
        payment = db.query(Payment).filter(Payment.stripe_intent_id == intent_id).first()
        if payment:
            payment.status = PaymentStatus.failed
            db.commit()

    return {"received": True}

# ── Queries ───────────────────────────────────────────────────────────────────

@router.get("/booking/{booking_id}")
def get_booking_payment(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return _serialize(payment)

@router.get("/admin/all")
def get_all_payments(status: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Payment)
    if status:
        q = q.filter(Payment.status == status)
    payments = q.order_by(Payment.created_at.desc()).all()
    return [_serialize(p) for p in payments]

def _serialize(p: Payment) -> dict:
    return {
        "id": p.id, "booking_id": p.booking_id,
        "amount": p.amount, "commission": p.commission, "pro_payout": p.pro_payout,
        "currency": p.currency, "method": p.method,
        "status": p.status.value if hasattr(p.status, 'value') else str(p.status),
        "stripe_intent_id": p.stripe_intent_id,
        "held_at": p.held_at.isoformat() if p.held_at else None,
        "released_at": p.released_at.isoformat() if p.released_at else None,
        "refunded_at": p.refunded_at.isoformat() if p.refunded_at else None,
        "refund_amount": p.refund_amount,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }