from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Booking, BookingStatus, User, Professional, Patient, Payment, PaymentStatus, DocStatus
from app.utils.pricing import calculate_price, MINIMUM_PRICES, detect_shift, HOUR_RATES, INITIAL_SERVICE_FEE
from app.utils.holidays import check_date_for_holiday

router = APIRouter(prefix="/bookings", tags=["bookings"])

class BookingCreate(BaseModel):
    patient_id:      str
    professional_id: str
    service_type:    str
    services:        List[str]     = []
    care_level:      Optional[int] = None
    duration_hours:  Optional[int] = None
    shift:           str           = "day"
    scheduled_start: datetime
    scheduled_end:   datetime
    is_urgent:       bool          = False
    is_holiday:      bool          = False
    distance_km:     float         = 0.0
    markup_pct:      int           = 0
    notes:           Optional[str] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

class CancelRequest(BaseModel):
    reason: Optional[str] = None

def _check_booking_access(booking: Booking, current: User, db: Session):
    if current.role.value == "admin":
        return
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if patient and patient.user_id == current.id:
        return
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if prof and prof.user_id == current.id:
        return
    raise HTTPException(403, "Access denied")

def _compute_price(body: BookingCreate, db: Session):
    """Compute price using v2 engine: Initial Fee + Hour Rate × minutes."""
    prof = db.query(Professional).filter(Professional.id == body.professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")
    user = db.query(User).filter(User.id == prof.user_id).first()
    if not user:
        raise HTTPException(404, "Professional user not found")
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role not in HOUR_RATES:
        return None
    try:
        return calculate_price(
            role=role,
            start_time=body.scheduled_start,
            end_time=body.scheduled_end,
            markup_pct=prof.markup_pct or 0,
            is_urgent=body.is_urgent,
            is_holiday=body.is_holiday,
            distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(400, f"Erro de preço: {e}")

def _get_refund_policy(booking: Booking, cancelled_by: str) -> dict:
    """
    Point 5 — Cancellation refund rules:
    Patient: >24h = full refund, <24h = partial (50%), <6h = no refund
    Professional: platform records, repeated = suspension risk
    """
    now = datetime.now(timezone.utc)
    start = booking.scheduled_start
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    hours_until = (start - now).total_seconds() / 3600

    if cancelled_by == "professional":
        return {
            "refund_pct":    100,
            "refund_reason": "Cancelamento pelo profissional — reembolso integral ao cliente",
        }
    # Client cancellation
    if hours_until > 24:
        return {"refund_pct": 100, "refund_reason": "Cancelamento com mais de 24h de antecedência"}
    elif hours_until > 6:
        return {"refund_pct": 50, "refund_reason": "Cancelamento entre 6–24h — reembolso de 50%"}
    else:
        return {"refund_pct": 0, "refund_reason": "Cancelamento com menos de 6h — sem reembolso"}

@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_booking(body: BookingCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    # Client verification gate
    if current.role.value == "client" and not current.is_verified:
        raise HTTPException(403, "Verifique sua identidade antes de agendar. Envie seus documentos no perfil.")

    # Minimum advance booking = 5 hours
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    hours_until = (body.scheduled_start.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600
    if hours_until < 5:
        raise HTTPException(400, "O agendamento deve ser feito com no mínimo 5 horas de antecedência.")

    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")

    # Auto-detect holiday if not already set
    date_str = body.scheduled_start.strftime("%Y-%m-%d")
    holiday_info = check_date_for_holiday(date_str, db)
    is_holiday = body.is_holiday or holiday_info["is_holiday"]

    # State registration validation — pro can only work in their COREN state
    if hasattr(body, 'professional_id') and body.professional_id:
        pro = db.query(Professional).filter(Professional.id == body.professional_id).first()
        if pro and pro.council_state and patient.address:
            pro_state = pro.council_state.upper()
            # Extract state from patient address (last 2 chars if it's a state code, or search for state abbreviation)
            addr_upper = patient.address.upper() if patient.address else ""
            STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
            patient_state = None
            for s in STATES:
                if f" {s}" in addr_upper or f"-{s}" in addr_upper or addr_upper.endswith(s):
                    patient_state = s
                    break
            if patient_state and patient_state != pro_state:
                raise HTTPException(403, f"Este profissional possui registro COREN-{pro_state} e não pode atender no estado {patient_state}.")

    server_price = _compute_price(body, db)
    booking_data = body.dict()
    booking_data["is_holiday"] = is_holiday
    if server_price:
        booking_data.update({
            "total_price":  server_price["total"],
            "platform_fee": server_price["platform_fee"],
            "pro_payout":   server_price["pro_payout"],
            "base_price":   server_price["base_price"],
            "markup_pct":   server_price["markup_pct"],
            "surcharge_pct":server_price["surcharge_pct"],
        })

    booking = Booking(**booking_data)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    return b

@router.get("/patient/{patient_or_user_id}")
def get_patient_bookings(patient_or_user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    patient = db.query(Patient).filter(Patient.id == patient_or_user_id).first()
    if not patient:
        patient = db.query(Patient).filter(Patient.user_id == patient_or_user_id).first()
    if not patient: raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.patient_id == patient.id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.get("/professional/{professional_id}")
def get_professional_bookings(professional_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof: raise HTTPException(404, "Professional not found")
    if prof.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    return db.query(Booking).filter(
        Booking.professional_id == professional_id
    ).order_by(Booking.scheduled_start.desc()).all()

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")
    b.status = BookingStatus.accepted
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/checkin")
def checkin(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status = BookingStatus.checked_in
    b.actual_checkin = datetime.utcnow()
    b.checkin_lat = body.lat
    b.checkin_lng = body.lng
    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/checkout")
def checkout(booking_id: str, body: CheckInOut, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    b.status = BookingStatus.completed
    b.actual_checkout = datetime.utcnow()

    # #7 Mandatory rest: check consecutive hours for this professional
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    if prof:
        now = datetime.utcnow()
        recent = db.query(Booking).filter(
            Booking.professional_id == prof.id,
            Booking.status == BookingStatus.completed,
            Booking.actual_checkout != None,
            Booking.actual_checkout >= now - timedelta(hours=48),
        ).order_by(Booking.actual_checkout.desc()).all()

        total_hours = sum(
            ((rb.actual_checkout - rb.actual_checkin).total_seconds() / 3600)
            for rb in recent if rb.actual_checkin and rb.actual_checkout
        )
        if total_hours >= 24:
            prof.rest_until = now + timedelta(hours=11)

    db.commit()
    db.refresh(b)
    return b

@router.patch("/{booking_id}/cancel")
def cancel_booking(
    booking_id: str,
    body:        CancelRequest = CancelRequest(),
    db:          Session = Depends(get_db),
    current:     User    = Depends(get_current_user),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status == BookingStatus.completed:
        raise HTTPException(400, "Cannot cancel a completed booking")

    # Determine who is cancelling
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    cancelled_by = "professional" if (prof and prof.user_id == current.id) else "client"

    # Apply refund policy
    refund_policy = _get_refund_policy(b, cancelled_by)

    b.status       = BookingStatus.cancelled
    b.cancel_reason = body.reason
    b.cancelled_by  = cancelled_by
    b.cancelled_at  = datetime.utcnow()

    # Update payment if exists
    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if payment and payment.status == PaymentStatus.held:
        if refund_policy["refund_pct"] == 100:
            payment.status = PaymentStatus.refunded
            payment.refunded_at = datetime.utcnow()
            payment.refund_reason = refund_policy["refund_reason"]
        elif refund_policy["refund_pct"] == 0:
            # No refund — release to professional
            payment.status = PaymentStatus.released
            payment.released_at = datetime.utcnow()
        else:
            # Partial refund — mark for manual processing
            payment.status = PaymentStatus.refunded
            payment.refund_reason = f"Reembolso parcial {refund_policy['refund_pct']}% — {refund_policy['refund_reason']}"

    db.commit()
    db.refresh(b)
    return {**{c.key: getattr(b, c.key) for c in b.__table__.columns if c.key != "status"},
            "status": b.status.value,
            "refund_policy": refund_policy}
# ── #13: Rescheduling ──────────────────────────────────────────────────────────

class RescheduleRequest(BaseModel):
    new_start: datetime
    new_end:   datetime

@router.post("/{booking_id}/reschedule")
def request_reschedule(booking_id: str, body: RescheduleRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client requests a reschedule. Must be >12h before original appointment."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.user_id != current.id:
        raise HTTPException(403, "Only the client can request a reschedule")
    if booking.status.value not in ("pending", "accepted"):
        raise HTTPException(400, "Só é possível reagendar atendimentos pendentes ou aceitos")

    hours_until = (booking.scheduled_start - datetime.now(timezone.utc)).total_seconds() / 3600
    if hours_until < 12:
        raise HTTPException(400, "Reagendamento só é permitido com mais de 12 horas de antecedência")

    # Store the reschedule request
    booking.reschedule_new_start = body.new_start
    booking.reschedule_new_end = body.new_end
    booking.reschedule_status = "requested"
    db.commit()
    return {"booking_id": booking_id, "reschedule_status": "requested", "new_start": body.new_start.isoformat(), "new_end": body.new_end.isoformat()}

@router.patch("/{booking_id}/reschedule/accept")
def accept_reschedule(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional accepts the reschedule request."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can accept a reschedule")

    if booking.reschedule_status != "requested":
        raise HTTPException(400, "No pending reschedule request")

    booking.scheduled_start = booking.reschedule_new_start
    booking.scheduled_end = booking.reschedule_new_end
    booking.reschedule_status = "accepted"
    db.commit()
    return {"booking_id": booking_id, "reschedule_status": "accepted"}

@router.patch("/{booking_id}/reschedule/decline")
def decline_reschedule(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional declines the reschedule request."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can decline a reschedule")

    booking.reschedule_status = "declined"
    db.commit()
    return {"booking_id": booking_id, "reschedule_status": "declined"}

# ── #15: Client Confirmation ───────────────────────────────────────────────────

@router.patch("/{booking_id}/confirm-checkin")
def confirm_checkin(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client confirms the professional has arrived and started service."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.user_id != current.id:
        raise HTTPException(403, "Only the client can confirm")
    if booking.status.value != "checked_in":
        raise HTTPException(400, "Professional hasn't checked in yet")

    booking.client_confirmed_start = True
    db.commit()
    return {"booking_id": booking_id, "client_confirmed_start": True}

@router.patch("/{booking_id}/confirm-checkout")
def confirm_checkout(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client confirms the service was completed satisfactorily."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.user_id != current.id:
        raise HTTPException(403, "Only the client can confirm")

    booking.client_confirmed_end = True
    db.commit()
    return {"booking_id": booking_id, "client_confirmed_end": True}

@router.post("/{booking_id}/report-issue")
def report_issue(booking_id: str, reason: str = "Problema com o atendimento", db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client reports an issue instead of confirming."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.user_id != current.id:
        raise HTTPException(403, "Only the client can report issues")

    booking.has_dispute = True
    booking.dispute_reason = reason
    db.commit()
    return {"booking_id": booking_id, "has_dispute": True, "reason": reason}

# ── #14: GPS Check-In/Check-Out ───────────────────────────────────────────────

class CheckInRequest(BaseModel):
    latitude:  float
    longitude: float

CHECK_IN_RADIUS_METERS = 500  # configurable

def _haversine_meters(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS coordinates."""
    import math
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@router.post("/{booking_id}/checkin")
def gps_checkin(booking_id: str, body: CheckInRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional checks in with GPS. Validates proximity if patient address has coords."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can check in")

    if booking.status.value != "accepted":
        raise HTTPException(400, "Só é possível fazer check-in em atendimentos aceitos")

    # Store GPS
    booking.checkin_lat = body.latitude
    booking.checkin_lng = body.longitude
    booking.actual_checkin = datetime.now(timezone.utc)
    booking.status = BookingStatus.checked_in
    booking.checkin_flagged = False

    # Validate proximity if patient has coordinates
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if patient and hasattr(patient, 'lat') and patient.lat and patient.lng:
        distance = _haversine_meters(body.latitude, body.longitude, patient.lat, patient.lng)
        if distance > CHECK_IN_RADIUS_METERS:
            booking.checkin_flagged = True
            booking.checkin_distance = round(distance)

    # Start 15-min arrival waiting timer
    booking.arrival_timer_start = datetime.now(timezone.utc)

    db.commit()
    return {
        "booking_id": booking_id, "status": "checked_in",
        "checkin_time": booking.actual_checkin.isoformat(),
        "flagged": booking.checkin_flagged,
        "message": "Check-in realizado. Aguardando confirmação do cliente." if not booking.checkin_flagged
                   else "⚠️ Check-in registrado, mas a localização está fora do raio esperado.",
    }

@router.post("/{booking_id}/checkout")
def gps_checkout(booking_id: str, body: CheckInRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional checks out with GPS. Calculates actual duration."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can check out")

    if booking.status.value != "checked_in":
        raise HTTPException(400, "Só é possível fazer checkout de atendimentos em andamento")

    booking.checkout_lat = body.latitude
    booking.checkout_lng = body.longitude
    booking.actual_checkout = datetime.now(timezone.utc)
    booking.status = BookingStatus.completed

    # Calculate actual duration
    if booking.actual_checkin:
        actual_minutes = (booking.actual_checkout - booking.actual_checkin).total_seconds() / 60
        booking.actual_duration_minutes = round(actual_minutes)

    # Update professional stats
    prof.completed_count = (prof.completed_count or 0) + 1
    db.commit()

    return {
        "booking_id": booking_id, "status": "completed",
        "checkout_time": booking.actual_checkout.isoformat(),
        "actual_duration_minutes": booking.actual_duration_minutes,
        "message": "Checkout realizado. Atendimento concluído.",
    }

# ── #16: Report Client No-Show ────────────────────────────────────────────────

@router.post("/{booking_id}/client-no-show")
def report_client_no_show(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional reports client no-show after 15-min waiting timer."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can report no-show")

    if booking.status.value != "checked_in":
        raise HTTPException(400, "Check-in necessário antes de reportar no-show")

    # Verify 15 minutes have passed since check-in
    if booking.arrival_timer_start:
        elapsed = (datetime.now(timezone.utc) - booking.arrival_timer_start).total_seconds() / 60
        if elapsed < 15:
            raise HTTPException(400, f"Aguarde {15 - int(elapsed)} minuto(s) antes de reportar no-show.")

    booking.status = BookingStatus.cancelled
    booking.cancel_reason = "client_no_show"
    booking.cancelled_by = "professional"
    booking.cancelled_at = datetime.now(timezone.utc)

    # Update client reliability
    client = db.query(User).filter(User.id == booking.user_id).first()
    if client:
        client.client_no_shows = (client.client_no_shows or 0) + 1
        client.reliability_score = max(0, (client.reliability_score or 100) - 10)

    db.commit()
    return {"booking_id": booking_id, "status": "cancelled", "reason": "client_no_show",
            "message": "No-show do cliente registrado. Pagamento será processado conforme política."}

# ── #17: Early Service Termination ────────────────────────────────────────────

class EarlyTerminationRequest(BaseModel):
    reason:    str
    is_serious: bool = False  # triggers dispute + payment hold
    latitude:  Optional[float] = None
    longitude: Optional[float] = None

MINIMUM_BILLABLE_MINUTES = 120  # 2 hours

@router.post("/{booking_id}/terminate-early")
def terminate_early(booking_id: str, body: EarlyTerminationRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """End service early. Available after 30 min of checked-in. Proportional payment."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    if booking.status.value != "checked_in":
        raise HTTPException(400, "Só é possível encerrar atendimentos em andamento")

    # Verify at least 30 min since check-in
    if booking.actual_checkin:
        elapsed_min = (datetime.now(timezone.utc) - booking.actual_checkin).total_seconds() / 60
        if elapsed_min < 30:
            raise HTTPException(400, f"Encerramento antecipado só é permitido após 30 minutos. Faltam {30 - int(elapsed_min)} min.")
    else:
        raise HTTPException(400, "Check-in não registrado")

    # Complete with early termination
    booking.actual_checkout = datetime.now(timezone.utc)
    booking.checkout_lat = body.latitude
    booking.checkout_lng = body.longitude
    actual_minutes = (booking.actual_checkout - booking.actual_checkin).total_seconds() / 60
    booking.actual_duration_minutes = max(round(actual_minutes), MINIMUM_BILLABLE_MINUTES)
    booking.early_termination = True
    booking.early_termination_reason = body.reason

    if body.is_serious:
        booking.has_dispute = True
        booking.dispute_reason = f"Encerramento antecipado grave: {body.reason}"
        booking.status = BookingStatus.completed
        # Payment held for dispute review
    else:
        booking.status = BookingStatus.completed

    db.commit()
    return {
        "booking_id": booking_id, "status": "completed",
        "actual_duration_minutes": booking.actual_duration_minutes,
        "billable_minutes": booking.actual_duration_minutes,
        "has_dispute": booking.has_dispute,
        "message": "Atendimento encerrado antecipadamente." + (" Disputa aberta para análise." if body.is_serious else ""),
    }

# ── #22: Smart Matching with Countdown ─────────────────────────────────────────

STANDARD_RESPONSE_HOURS = 3
URGENT_RESPONSE_MINUTES = 90
MAX_MATCH_BATCH = 5

@router.post("/{booking_id}/smart-match")
def initiate_smart_match(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Send booking request to top matching professionals with a countdown timer."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status.value != "pending":
        raise HTTPException(400, "Só é possível buscar profissionais para atendimentos pendentes")

    # Find top matching pros
    pros = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available == True,
    ).all()

    now = datetime.now(timezone.utc)
    scored = []
    for p in pros:
        if p.rest_until and p.rest_until > now:
            continue
        user = db.query(User).filter(User.id == p.user_id).first()
        if not user:
            continue
        score = (p.reliability_score or 100) + (p.rating_avg or 0) * 10 + (p.completed_count or 0)
        scored.append((score, p, user))

    scored.sort(key=lambda x: -x[0])
    top_pros = scored[:MAX_MATCH_BATCH]

    if not top_pros:
        return {"booking_id": booking_id, "matched": 0, "message": "Nenhum profissional disponível para este atendimento."}

    # Set countdown
    if booking.is_urgent:
        deadline = now + timedelta(minutes=URGENT_RESPONSE_MINUTES)
    else:
        deadline = now + timedelta(hours=STANDARD_RESPONSE_HOURS)

    booking.match_deadline = deadline
    booking.match_batch = 1
    booking.matched_pro_ids = [p.id for _, p, _ in top_pros]

    db.commit()

    return {
        "booking_id": booking_id,
        "matched": len(top_pros),
        "deadline": deadline.isoformat(),
        "response_window": f"{URGENT_RESPONSE_MINUTES}min" if booking.is_urgent else f"{STANDARD_RESPONSE_HOURS}h",
        "professionals": [
            {"id": p.id, "name": u.full_name, "rating": p.rating_avg, "reliability": p.reliability_score}
            for _, p, u in top_pros
        ],
        "message": f"Solicitação enviada para {len(top_pros)} profissional(is). Aguardando resposta.",
    }

@router.post("/{booking_id}/smart-match/expire")
def expire_and_rematch(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Called when countdown expires — re-match with next batch of pros."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status.value != "pending":
        return {"message": "Atendimento já foi aceito ou cancelado."}

    # Exclude previously matched pros
    excluded = set(booking.matched_pro_ids or [])
    now = datetime.now(timezone.utc)

    pros = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available == True,
    ).all()

    scored = []
    for p in pros:
        if p.id in excluded:
            continue
        if p.rest_until and p.rest_until > now:
            continue
        user = db.query(User).filter(User.id == p.user_id).first()
        if not user:
            continue
        score = (p.reliability_score or 100) + (p.rating_avg or 0) * 10
        scored.append((score, p, user))

    scored.sort(key=lambda x: -x[0])
    next_batch = scored[:MAX_MATCH_BATCH]

    if not next_batch:
        return {"booking_id": booking_id, "matched": 0, "message": "Nenhum profissional adicional disponível. Considere criar um alerta."}

    if booking.is_urgent:
        deadline = now + timedelta(minutes=URGENT_RESPONSE_MINUTES)
    else:
        deadline = now + timedelta(hours=STANDARD_RESPONSE_HOURS)

    booking.match_deadline = deadline
    booking.match_batch = (booking.match_batch or 1) + 1
    booking.matched_pro_ids = list(excluded) + [p.id for _, p, _ in next_batch]

    db.commit()

    return {
        "booking_id": booking_id,
        "matched": len(next_batch),
        "batch": booking.match_batch,
        "deadline": deadline.isoformat(),
        "professionals": [{"id": p.id, "name": u.full_name} for _, p, u in next_batch],
        "message": f"Lote {booking.match_batch}: solicitação enviada para {len(next_batch)} profissional(is).",
    }

# ── #11: Cancellation System ──────────────────────────────────────────────────

GRACE_PERIOD_MINUTES = 10
CANCELLATION_REASONS = [
    "Mudança de planos",
    "Problema de saúde",
    "Profissional indisponível",
    "Encontrei outro profissional",
    "Erro no agendamento",
    "Problema financeiro",
    "Emergência pessoal",
    "Outro",
]

class CancelRequest(BaseModel):
    reason:      str
    detail:      Optional[str] = None
    cancelled_by: str = "client"  # "client" | "professional"

@router.post("/{booking_id}/cancel")
def cancel_booking(booking_id: str, body: CancelRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Cancel booking with tiered refund policy + grace period."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    if booking.status.value in ("completed", "cancelled"):
        raise HTTPException(400, "Atendimento já foi concluído ou cancelado")

    now = datetime.now(timezone.utc)

    # Determine refund percentage
    hours_until = (booking.scheduled_start.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600
    minutes_since_creation = (now - booking.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 60 if booking.created_at else 999

    # Grace period: free cancellation within 10 min if pro hasn't accepted and >12h before
    is_grace = minutes_since_creation <= GRACE_PERIOD_MINUTES and booking.status.value == "pending" and hours_until > 12

    if is_grace:
        refund_pct = 100
    elif hours_until > 12:
        refund_pct = 100
    elif hours_until >= 2:
        refund_pct = 50
    else:
        refund_pct = 0

    # Update booking
    booking.status = BookingStatus.cancelled
    booking.cancel_reason = f"{body.reason}: {body.detail}" if body.detail else body.reason
    booking.cancelled_by = body.cancelled_by
    booking.cancelled_at = now

    # Update reliability score
    if body.cancelled_by == "professional":
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if prof:
            prof.late_cancellations = (prof.late_cancellations or 0) + 1
            prof.reliability_score = max(0, (prof.reliability_score or 100) - 5)

            # Progressive penalties
            if prof.late_cancellations >= 5:
                prof.is_available = False  # auto-ban after 5 cancellations
    else:
        client = db.query(User).filter(User.id == booking.user_id).first()
        if client and not is_grace:
            client.reliability_score = max(0, (client.reliability_score or 100) - 3)

    db.commit()

    # Process refund if payment exists
    refund_result = None
    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
    if payment and payment.status.value in ("held", "pending") and refund_pct > 0:
        refund_amount = round(payment.amount * refund_pct / 100, 2)
        payment.status = PaymentStatus.refunded
        payment.refunded_at = now
        payment.refund_amount = refund_amount
        payment.refund_reason = body.reason
        db.commit()
        refund_result = {"refund_pct": refund_pct, "refund_amount": refund_amount}

    return {
        "booking_id": booking_id,
        "status": "cancelled",
        "reason": booking.cancel_reason,
        "cancelled_by": body.cancelled_by,
        "grace_period": is_grace,
        "refund": refund_result,
        "policy": f"{'Período de graça: ' if is_grace else ''}{refund_pct}% de reembolso" +
                  (f" (mais de 12h)" if hours_until > 12 else f" ({hours_until:.0f}h antes)" if refund_pct > 0 else " (menos de 2h)"),
        "cancellation_reasons": CANCELLATION_REASONS,
    }

@router.get("/cancellation-reasons")
def get_cancellation_reasons():
    """Return list of valid cancellation reasons."""
    return {"reasons": CANCELLATION_REASONS}

# ── #12: Professional Cancellation + Replacement ──────────────────────────────

@router.post("/{booking_id}/replace-professional")
def replace_professional(booking_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: auto-match replacement professional for a cancelled booking."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    now = datetime.now(timezone.utc)
    excluded = set(booking.matched_pro_ids or [])
    if booking.professional_id:
        excluded.add(booking.professional_id)

    pros = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available == True,
    ).all()

    candidates = []
    for p in pros:
        if p.id in excluded:
            continue
        if p.rest_until and p.rest_until > now:
            continue
        user = db.query(User).filter(User.id == p.user_id).first()
        if not user:
            continue
        score = (p.reliability_score or 100) + (p.rating_avg or 0) * 10
        candidates.append((score, p, user))

    candidates.sort(key=lambda x: -x[0])

    if not candidates:
        return {"booking_id": booking_id, "replacement": None, "message": "Nenhum profissional substituto disponível."}

    best = candidates[0]
    # Reset booking for new professional
    booking.professional_id = best[1].id
    booking.status = BookingStatus.pending
    booking.cancel_reason = None
    booking.cancelled_by = None
    booking.cancelled_at = None
    db.commit()

    return {
        "booking_id": booking_id,
        "replacement": {"id": best[1].id, "name": best[2].full_name, "reliability": best[1].reliability_score},
        "message": f"Profissional substituto encontrado: {best[2].full_name}",
    }