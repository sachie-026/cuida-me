"""
Payment System — Stripe Connect Split Payments
================================================
Flow: client pays full price → Stripe splits automatically →
  88% to professional's connected account, 12% stays with CuidaU.
Triggered by client confirmation or 24h auto-confirm after service completion.
Supports PIX (via Stripe) and credit/debit card pre-authorization.
Stripe keys read from environment: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
"""
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Payment, PaymentStatus, Booking, BookingStatus, User, Patient, Professional, Wallet, WalletTransaction
from app.utils.notification_engine import fire_event

router = APIRouter(prefix="/payments", tags=["payments"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

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

def _credit_wallets(db: Session, payment: Payment, booking: Booking):
    """Credit professional + platform wallets after payment release."""
    try:
        pro_amount = payment.pro_payout or 0
        platform_amount = payment.commission or 0

        # Professional wallet
        if booking.professional_id:
            pro_wallet = db.query(Wallet).filter(
                Wallet.owner_type == "professional",
                Wallet.owner_id == booking.professional_id,
            ).first()
            if not pro_wallet:
                pro_wallet = Wallet(owner_type="professional", owner_id=booking.professional_id, balance=0.0)
                db.add(pro_wallet)
                db.flush()

            pro_wallet.balance = (pro_wallet.balance or 0) + pro_amount
            db.add(WalletTransaction(
                wallet_id=pro_wallet.id,
                booking_id=booking.id,
                payment_id=payment.id,
                amount=pro_amount,
                tx_type="credit",
                description=f"Pagamento: {booking.service_type or 'Serviço'} (88%)",
            ))

        # Platform wallet (owner_id = None)
        platform_wallet = db.query(Wallet).filter(
            Wallet.owner_type == "platform",
            Wallet.owner_id.is_(None),
        ).first()
        if not platform_wallet:
            platform_wallet = Wallet(owner_type="platform", owner_id=None, balance=0.0)
            db.add(platform_wallet)
            db.flush()

        platform_wallet.balance = (platform_wallet.balance or 0) + platform_amount
        db.add(WalletTransaction(
            wallet_id=platform_wallet.id,
            booking_id=booking.id,
            payment_id=payment.id,
            amount=platform_amount,
            tx_type="credit",
            description=f"Comissão: {booking.service_type or 'Serviço'} (12%)",
        ))

        db.commit()
        print(f"[WALLET] Credited pro={pro_amount:.2f} platform={platform_amount:.2f} for booking {booking.id[:8]}")
    except Exception as e:
        print(f"[WALLET] Error crediting wallets for booking {booking.id}: {e}")
        db.rollback()


# ── Schemas ────────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    booking_id: str
    method:     str   # "pix" | "credit_card" | "debit_card"
    payment_method_id: Optional[str] = None  # Stripe PaymentMethod ID (saved card)

class RefundRequest(BaseModel):
    booking_id: str
    reason:     Optional[str] = "Cancelamento do agendamento"
    percentage: int = 100  # 100, 50, or 0


def _get_or_create_stripe_customer(stripe, user: User, db) -> str:
    """Get or create a Stripe Customer for this user."""
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name,
        metadata={"user_id": user.id},
    )
    user.stripe_customer_id = customer.id
    db.commit()
    return customer.id

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    """Return publishable key for frontend Stripe.js initialization."""
    return {"publishable_key": STRIPE_PUBLISHABLE_KEY}

# ── Stripe Connect Onboarding ────────────────────────────────────────────────

@router.post("/connect/onboard")
def create_connect_account(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Create a Stripe Connect Express account for the professional and return onboarding link."""
    pro = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not pro:
        raise HTTPException(403, "Somente profissionais podem configurar conta de recebimento")

    stripe = get_stripe()
    if not stripe:
        return {
            "mock": True,
            "message": "Stripe não configurado (modo desenvolvimento). Conta simulada criada.",
            "onboarding_url": None,
            "stripe_connect_id": "acct_mock_" + pro.id[:8],
        }

    try:
        # If pro already has a Connect account, just create a new onboarding link
        if pro.stripe_connect_id:
            account_link = stripe.AccountLink.create(
                account=pro.stripe_connect_id,
                refresh_url=f"{FRONTEND_URL}/professional/stripe-connect?refresh=true",
                return_url=f"{FRONTEND_URL}/professional/stripe-connect?success=true",
                type="account_onboarding",
            )
            return {
                "stripe_connect_id": pro.stripe_connect_id,
                "onboarding_url": account_link.url,
                "onboarding_complete": pro.stripe_onboarding_complete,
            }

        # Create new Express account for Brazil
        account = stripe.Account.create(
            type="express",
            country="BR",
            email=current.email,
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            metadata={
                "professional_id": pro.id,
                "user_id": current.id,
            },
        )

        pro.stripe_connect_id = account.id
        db.commit()

        # Create onboarding link
        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=f"{FRONTEND_URL}/professional/stripe-connect?refresh=true",
            return_url=f"{FRONTEND_URL}/professional/stripe-connect?success=true",
            type="account_onboarding",
        )

        return {
            "stripe_connect_id": account.id,
            "onboarding_url": account_link.url,
            "onboarding_complete": False,
        }
    except Exception as e:
        raise HTTPException(400, f"Erro ao criar conta Stripe Connect: {str(e)}")

@router.get("/connect/status")
def connect_status(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Check the Stripe Connect onboarding status for the professional."""
    pro = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not pro:
        raise HTTPException(403, "Somente profissionais podem verificar status de conta")

    if not pro.stripe_connect_id:
        return {
            "has_account": False,
            "onboarding_complete": False,
            "charges_enabled": False,
            "payouts_enabled": False,
        }

    stripe = get_stripe()
    if not stripe:
        return {
            "has_account": True,
            "onboarding_complete": True,
            "charges_enabled": True,
            "payouts_enabled": True,
            "mock": True,
        }

    try:
        account = stripe.Account.retrieve(pro.stripe_connect_id)

        # Update onboarding status if it just completed
        if account.charges_enabled and account.payouts_enabled and not pro.stripe_onboarding_complete:
            pro.stripe_onboarding_complete = True
            db.commit()

        return {
            "has_account": True,
            "stripe_connect_id": pro.stripe_connect_id,
            "onboarding_complete": pro.stripe_onboarding_complete,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "details_submitted": account.details_submitted,
        }
    except Exception as e:
        raise HTTPException(400, f"Erro ao verificar conta: {str(e)}")

@router.get("/connect/dashboard-link")
def connect_dashboard_link(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Get a link to the Stripe Express dashboard for the professional."""
    pro = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not pro or not pro.stripe_connect_id:
        raise HTTPException(400, "Conta Stripe Connect não encontrada")

    stripe = get_stripe()
    if not stripe:
        return {"mock": True, "url": None, "message": "Stripe não configurado (modo desenvolvimento)."}

    try:
        login_link = stripe.Account.create_login_link(pro.stripe_connect_id)
        return {"url": login_link.url}
    except Exception as e:
        raise HTTPException(400, f"Erro ao gerar link do painel: {str(e)}")

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
    if existing and existing.status.value not in ("failed", "refunded", "pending"):
        raise HTTPException(400, "Pagamento já existe para este agendamento")
    # If a previous attempt failed/stuck, remove it so a fresh one can be created
    if existing and existing.status.value in ("failed", "refunded", "pending"):
        db.delete(existing)
        db.flush()

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
            pro_payout_cents = int(pro_payout * 100)
            customer_id = _get_or_create_stripe_customer(stripe, current, db)

            # Check if professional has a Stripe Connect account for split payments
            pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
            connect_id = pro.stripe_connect_id if pro and pro.stripe_onboarding_complete else None

            if body.method == "pix":
                intent_params = {
                    "amount": amount_cents,
                    "currency": "brl",
                    "customer": customer_id,
                    "payment_method_types": ["pix"],
                    "metadata": {"booking_id": body.booking_id},
                }
                # Split payment via Stripe Connect
                if connect_id:
                    intent_params["transfer_data"] = {
                        "destination": connect_id,
                        "amount": pro_payout_cents,  # 88% goes to pro
                    }
                intent = stripe.PaymentIntent.create(**intent_params)
                payment.stripe_intent_id = intent.id
                result["client_secret"] = intent.client_secret
                result["status"] = "awaiting_pix"
            else:
                # Credit/debit — capture_method=manual for pre-auth
                intent_params = {
                    "amount": amount_cents,
                    "currency": "brl",
                    "customer": customer_id,
                    "payment_method_types": ["card"],
                    "capture_method": "manual",
                    "metadata": {"booking_id": body.booking_id},
                }
                # Split payment via Stripe Connect
                if connect_id:
                    intent_params["transfer_data"] = {
                        "destination": connect_id,
                        "amount": pro_payout_cents,  # 88% goes to pro
                    }
                # If using a saved payment method, attach it
                if body.payment_method_id:
                    intent_params["payment_method"] = body.payment_method_id
                    intent_params["confirm"] = True
                    intent_params["off_session"] = False
                intent = stripe.PaymentIntent.create(**intent_params)
                payment.stripe_intent_id = intent.id
                result["client_secret"] = intent.client_secret
                result["status"] = "awaiting_card"
                if body.payment_method_id and intent.status in ("succeeded", "requires_capture"):
                    result["status"] = "confirmed"
        except Exception as e:
            payment.status = PaymentStatus.failed
            db.add(payment)
            db.commit()
            # ── Notify: payment.failed → client ──
            try:
                fire_event(db, "payment.failed", {
                    "service": booking.service_type or "Cuidado",
                    "booking_code": f"#{booking.id[:6].upper()}",
                    "booking_id": booking.id,
                    "amount": f"{amount_brl:.2f}",
                    "error_message": str(e)[:100],
                }, recipient_users={"client": [current]})
                db.commit()
            except Exception:
                pass
            raise HTTPException(400, f"Erro Stripe: {str(e)}")
    else:
        # No Stripe configured — dev/mock mode: auto-confirm as held (escrow)
        payment.status = PaymentStatus.held
        payment.held_at = datetime.now(timezone.utc)
        result["message"] = "Modo desenvolvimento: Stripe não configurado. Pagamento simulado e confirmado."
        result["mock"] = True
        result["status"] = "held"
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

    # ── Notify: payment.authorized → client ──
    try:
        booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
        client_user = db.query(User).filter(User.id == booking.user_id).first() if booking else None
        if client_user and booking:
            fire_event(db, "payment.authorized", {
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "amount": f"{payment.amount:.2f}",
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] payment.authorized error: {e}")

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

    # Stripe Connect: transfer pro's share to their connected account
    stripe = get_stripe()
    if stripe and payment.stripe_intent_id:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if pro and pro.stripe_connect_id and pro.stripe_onboarding_complete:
            try:
                # Check if payment already has transfer_data (split at creation)
                intent = stripe.PaymentIntent.retrieve(payment.stripe_intent_id)
                has_auto_split = bool(intent.get("transfer_data"))

                if not has_auto_split:
                    # Manual transfer for bookings created before Connect was set up
                    pro_payout_cents = int(payment.pro_payout * 100)
                    stripe.Transfer.create(
                        amount=pro_payout_cents,
                        currency="brl",
                        destination=pro.stripe_connect_id,
                        source_transaction=intent.latest_charge,
                        metadata={
                            "booking_id": booking.id,
                            "payment_id": payment.id,
                        },
                    )
            except Exception as e:
                print(f"[STRIPE] Transfer error for booking {booking.id}: {e}")
                # Don't block release — log the error and admin can retry
                pass

    payment.status = PaymentStatus.released
    payment.released_at = datetime.now(timezone.utc)
    db.commit()

    # Credit dummy wallets
    _credit_wallets(db, payment, booking)

    # ── Notify: payment.released_to_professional → professional ──
    try:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        pro_user = db.query(User).filter(User.id == pro.user_id).first() if pro else None
        if pro_user:
            fire_event(db, "payment.released_to_professional", {
                "amount": f"{payment.pro_payout:.2f}",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "service": booking.service_type or "Cuidado",
            }, recipient_users={"professional": [pro_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] payment.released_to_professional error: {e}")

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

    # ── Notify: payment.refund_issued → client ──
    try:
        booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
        client_user = db.query(User).filter(User.id == booking.user_id).first() if booking else None
        if client_user and booking:
            fire_event(db, "payment.refund_issued", {
                "amount": f"{refund_amount:.2f}",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "refund_reason": body.reason or "Cancelamento",
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] payment.refund_issued error: {e}")

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

            # ── Notify: payment.authorized → client ──
            try:
                booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
                client_user = db.query(User).filter(User.id == booking.user_id).first() if booking else None
                if client_user and booking:
                    fire_event(db, "payment.authorized", {
                        "service": booking.service_type or "Cuidado",
                        "booking_code": f"#{booking.id[:6].upper()}",
                        "booking_id": booking.id,
                        "amount": f"{payment.amount:.2f}",
                    }, recipient_users={"client": [client_user]})
                    db.commit()
            except Exception as e:
                print(f"[NOTIFY] payment.authorized (webhook) error: {e}")

    elif event_type == "payment_intent.payment_failed":
        intent_id = data_obj.get("id")
        payment = db.query(Payment).filter(Payment.stripe_intent_id == intent_id).first()
        if payment:
            payment.status = PaymentStatus.failed
            db.commit()

            # ── Notify: payment.failed → client ──
            try:
                booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
                client_user = db.query(User).filter(User.id == booking.user_id).first() if booking else None
                if client_user and booking:
                    fire_event(db, "payment.failed", {
                        "service": booking.service_type or "Cuidado",
                        "booking_code": f"#{booking.id[:6].upper()}",
                        "booking_id": booking.id,
                        "amount": f"{payment.amount:.2f}",
                        "error_message": data_obj.get("last_payment_error", {}).get("message", "Pagamento recusado"),
                    }, recipient_users={"client": [client_user]})
                    db.commit()
            except Exception as e:
                print(f"[NOTIFY] payment.failed (webhook) error: {e}")

    return {"received": True}

# ── Saved Payment Methods (Client) ────────────────────────────────────────────

@router.post("/setup-intent")
def create_setup_intent(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Create a SetupIntent so the client can save a card via Stripe Elements."""
    stripe = get_stripe()
    if not stripe:
        return {"mock": True, "message": "Stripe não configurado (modo desenvolvimento)."}
    try:
        customer_id = _get_or_create_stripe_customer(stripe, current, db)
        intent = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method_types=["card"],
        )
        return {"client_secret": intent.client_secret, "customer_id": customer_id}
    except Exception as e:
        raise HTTPException(400, f"Erro ao criar setup: {str(e)}")

@router.get("/methods")
def list_payment_methods(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """List saved payment methods for the current user."""
    stripe = get_stripe()
    if not stripe or not current.stripe_customer_id:
        return {"methods": []}
    try:
        methods = stripe.PaymentMethod.list(
            customer=current.stripe_customer_id,
            type="card",
        )
        return {"methods": [
            {
                "id": m.id,
                "brand": m.card.brand,
                "last4": m.card.last4,
                "exp_month": m.card.exp_month,
                "exp_year": m.card.exp_year,
            }
            for m in methods.data
        ]}
    except Exception as e:
        raise HTTPException(400, f"Erro ao listar métodos: {str(e)}")

@router.delete("/methods/{method_id}")
def delete_payment_method(method_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Detach a saved payment method."""
    stripe = get_stripe()
    if not stripe:
        raise HTTPException(400, "Stripe não configurado.")
    try:
        pm = stripe.PaymentMethod.retrieve(method_id)
        if pm.customer != current.stripe_customer_id:
            raise HTTPException(403, "Este método não pertence a você.")
        stripe.PaymentMethod.detach(method_id)
        return {"message": "Método de pagamento removido."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao remover método: {str(e)}")

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

# ── Auto-confirm: release payments for completed bookings after 24h ──────────

@router.post("/auto-confirm-releases")
def auto_confirm_releases(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Auto-release payments for completed bookings where client hasn't confirmed
    within 24h. Called by a scheduled task or admin manually."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    # Find completed bookings with held payments where service ended > 24h ago
    held_payments = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(
            Payment.status == PaymentStatus.held,
            Booking.status == BookingStatus.completed,
            Booking.has_dispute == False,
            Booking.checkout_time <= cutoff,
        )
        .all()
    )

    released = []
    for payment in held_payments:
        booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
        if not booking:
            continue

        try:
            _do_release_payment(payment, booking, db)
            released.append(payment.id)
        except Exception as e:
            print(f"[AUTO-RELEASE] Error releasing payment {payment.id}: {e}")

    return {"released_count": len(released), "released_ids": released}


def _do_release_payment(payment: Payment, booking: Booking, db: Session):
    """Shared logic for releasing a payment — used by release_payment endpoint
    and auto-confirm. Performs Stripe Connect transfer if applicable."""
    stripe = get_stripe()
    if stripe and payment.stripe_intent_id:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if pro and pro.stripe_connect_id and pro.stripe_onboarding_complete:
            try:
                intent = stripe.PaymentIntent.retrieve(payment.stripe_intent_id)
                has_auto_split = bool(intent.get("transfer_data"))

                if not has_auto_split:
                    pro_payout_cents = int(payment.pro_payout * 100)
                    stripe.Transfer.create(
                        amount=pro_payout_cents,
                        currency="brl",
                        destination=pro.stripe_connect_id,
                        source_transaction=intent.latest_charge,
                        metadata={
                            "booking_id": booking.id,
                            "payment_id": payment.id,
                        },
                    )
            except Exception as e:
                print(f"[STRIPE] Transfer error for booking {booking.id}: {e}")

    payment.status = PaymentStatus.released
    payment.released_at = datetime.now(timezone.utc)
    db.commit()

    # Credit dummy wallets
    _credit_wallets(db, payment, booking)

    # Notify professional
    try:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        pro_user = db.query(User).filter(User.id == pro.user_id).first() if pro else None
        if pro_user:
            fire_event(db, "payment.released_to_professional", {
                "amount": f"{payment.pro_payout:.2f}",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "service": booking.service_type or "Cuidado",
            }, recipient_users={"professional": [pro_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] payment.released_to_professional error: {e}")


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