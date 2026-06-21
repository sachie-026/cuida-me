"""
Payment System
==============
Escrow model: patient pays → held → released after completion.
PIX and card integrations are stubbed — wire Stripe/Gerencianet before production.

TODO: Wire Stripe Connect for credit/debit card processing
TODO: Wire Gerencianet or Efí Pay for PIX integration
TODO: Implement webhook handlers for async payment confirmation
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Payment, PaymentStatus, Booking, BookingStatus, User

router = APIRouter(prefix="/payments", tags=["payments"])

class PaymentCreate(BaseModel):
    booking_id: str
    method:     str   # "pix" | "credit_card" | "debit_card"

class PaymentRelease(BaseModel):
    booking_id: str

@router.post("/initiate", status_code=201)
def initiate_payment(body: PaymentCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """
    Initiate payment for a booking (before professional confirms).
    Creates payment record in 'pending' state.
    In production: call Stripe/Gerencianet API here and return payment URL.
    """
    booking = db.query(Booking).filter(Booking.id == body.booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Verify client owns this booking
    from app.models.models import Patient
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if not patient or (patient.user_id != current.id and current.role.value != "admin"):
        raise HTTPException(403, "Access denied")

    # Check no existing payment
    existing = db.query(Payment).filter(Payment.booking_id == body.booking_id).first()
    if existing:
        raise HTTPException(400, "Payment already exists for this booking")

    if body.method not in ("pix", "credit_card", "debit_card"):
        raise HTTPException(400, "Invalid payment method. Use: pix, credit_card, debit_card")

    commission = round(booking.total_price * 12 / 100, 2)
    pro_payout  = round(booking.total_price - commission, 2)

    payment = Payment(
        booking_id=body.booking_id,
        amount=booking.total_price,
        commission=commission,
        pro_payout=pro_payout,
        currency="BRL",
        method=body.method,
        status=PaymentStatus.pending,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    # TODO: In production, integrate real payment gateway here:
    # if body.method == "pix":
    #     pix_response = gerencianet.create_pix_charge(amount=booking.total_price)
    #     payment.pix_code = pix_response["pix_copy_paste"]
    # elif body.method in ("credit_card", "debit_card"):
    #     intent = stripe.PaymentIntent.create(amount=int(booking.total_price*100), currency="brl")
    #     payment.stripe_intent_id = intent.id
    #     return {"payment_id": payment.id, "client_secret": intent.client_secret}

    return {
        "payment_id":   payment.id,
        "amount":       payment.amount,
        "method":       payment.method,
        "status":       payment.status.value,
        "message":      "Pagamento iniciado. Em produção, o gateway de pagamento seria acionado aqui.",
        # Simulated PIX for dev
        "pix_code":     f"00020126360014BR.GOV.BCB.PIX0114+55119999-{payment.id[:8]}5204000053039865802BR5913CuidaU6009SAO PAULO62070503***6304{'ABCD'}" if body.method == "pix" else None,
    }

@router.post("/confirm/{payment_id}")
def confirm_payment(payment_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """
    Confirm payment received — moves to 'held' (escrow).
    In production this would be called by a webhook from the payment gateway.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(400, f"Cannot confirm payment in '{payment.status.value}' state")

    payment.status  = PaymentStatus.held
    payment.held_at = datetime.utcnow()
    db.commit()
    db.refresh(payment)
    return {"payment_id": payment.id, "status": payment.status.value, "message": "Pagamento confirmado e em custódia."}

@router.post("/release/{booking_id}")
def release_payment(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """
    Release payment to professional after service completion.
    Called automatically on checkout, or manually by client/admin.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status != BookingStatus.completed:
        raise HTTPException(400, "Can only release payment for completed bookings")

    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    if payment.status != PaymentStatus.held:
        raise HTTPException(400, f"Payment is not in escrow (status: {payment.status.value})")

    # Verify client or admin
    from app.models.models import Patient
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if not patient or (patient.user_id != current.id and current.role.value != "admin"):
        raise HTTPException(403, "Access denied")

    payment.status      = PaymentStatus.released
    payment.released_at = datetime.utcnow()
    db.commit()
    db.refresh(payment)

    # TODO: In production, trigger transfer to professional's bank account/wallet
    return {
        "payment_id":  payment.id,
        "status":      payment.status.value,
        "pro_payout":  payment.pro_payout,
        "commission":  payment.commission,
        "message":     "Pagamento liberado ao profissional.",
    }

@router.get("/booking/{booking_id}")
def get_booking_payment(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return {**{c.key: getattr(payment, c.key) for c in payment.__table__.columns if c.key != "status"},
            "status": payment.status.value}

@router.get("/admin/all")
def get_all_payments(
    status: Optional[str] = None,
    db:     Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(Payment)
    if status:
        q = q.filter(Payment.status == status)
    payments = q.order_by(Payment.created_at.desc()).all()
    return [
        {**{c.key: getattr(p, c.key) for c in p.__table__.columns if c.key != "status"},
         "status": p.status.value}
        for p in payments
    ]