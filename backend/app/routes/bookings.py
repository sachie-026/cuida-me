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
    # Client verification gate — check BOTH document AND phone verification
    if current.role.value == "client":
        if not current.is_verified:
            raise HTTPException(403, "Verifique sua identidade antes de agendar. Envie seus documentos no perfil.")
        if not getattr(current, 'phone_verified', False):
            raise HTTPException(403, "Verifique seu telefone antes de agendar. Acesse Perfil → Verificar telefone.")

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

    # 50-37: Save pricing snapshot at creation — historical bookings never recalculate
    try:
        from app.routes.settings import get_all_settings
        pricing_snapshot = get_all_settings(db)
        # Store only pricing-relevant keys
        snapshot_keys = [k for k in pricing_snapshot if any(k.startswith(p) for p in
            ["initial_fee_", "day_rate_", "night_rate_", "platform_commission", "holiday_",
             "urgent_", "travel_", "client_service_fee", "professional_payout", "cancel_"])]
        booking_data["pricing_snapshot"] = {k: pricing_snapshot[k] for k in snapshot_keys}
    except:
        pass

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
def accept_booking(booking_id: str, accept_caregiver_terms: bool = False, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")

    # V9-6/Change 43: Per-booking caregiver terms acceptance
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    if prof and prof.active_category == "caregiver":
        user = db.query(User).filter(User.id == prof.user_id).first()
        original_role = user.role.value if user and hasattr(user.role, 'value') else ""
        if original_role in ("nurse", "technician", "nursing_assistant"):
            if not accept_caregiver_terms:
                raise HTTPException(400, "Você deve aceitar os termos de atuação como Cuidador(a) para aceitar este agendamento.")
            # Record per-booking acceptance
            acceptance = {
                "professional_id": prof.id,
                "booking_id": booking_id,
                "terms_text": "Eu entendo que, ao aceitar este atendimento como Cuidador(a), prestarei exclusivamente cuidados não-técnicos e não realizarei procedimentos técnicos de enfermagem.",
                "terms_version": "v1.0",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "type": "per_booking",
            }
            if not prof.category_acceptances:
                prof.category_acceptances = []
            prof.category_acceptances = prof.category_acceptances + [acceptance]

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
    booking.status = BookingStatus.professional_arrived
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
        "message": "Check-in realizado. Clique em 'Iniciar Serviço' quando o cliente estiver disponível." if not booking.checkin_flagged
                   else "⚠️ Check-in registrado, mas a localização está fora do raio esperado.",
    }

@router.post("/{booking_id}/start-service")
def start_service(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Professional starts the service after check-in and client is available."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can start service")
    if booking.status.value not in ("checked_in", "professional_arrived"):
        raise HTTPException(400, "Check-in necessário antes de iniciar o serviço")

    booking.service_started_at = datetime.now(timezone.utc)
    booking.status = BookingStatus.checked_in
    db.commit()
    return {"booking_id": booking_id, "service_started": True, "started_at": booking.service_started_at.isoformat(),
            "message": "Serviço iniciado. Bom atendimento!"}

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

    # #14: Calculate actual duration for audit, but payment uses SCHEDULED time
    if booking.actual_checkin:
        actual_minutes = (booking.actual_checkout - booking.actual_checkin).total_seconds() / 60
        booking.actual_duration_minutes = round(actual_minutes)
    # Payment is always based on scheduled_start → scheduled_end (not GPS timestamps)
    # Only Early Termination or Real-Time Extension can change the paid duration

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
    reason:      str
    reason_category: Optional[str] = None  # "client_general","client_serious","professional"
    detail:      Optional[str] = None
    is_serious:  bool = False  # triggers dispute + payment hold
    evidence_url: Optional[str] = None
    latitude:    Optional[float] = None
    longitude:   Optional[float] = None

CLIENT_TERMINATION_REASONS = [
    "Cuidado não é mais necessário", "Paciente hospitalizado", "Decisão familiar",
    "Conflito de agenda", "Motivos financeiros", "Paciente faleceu", "Outro",
]
CLIENT_SERIOUS_REASONS = [
    "Negligência profissional", "Prática clínica insegura", "Qualidade de cuidado ruim",
    "Conduta inadequada", "Comportamento desrespeitoso", "Profissional sob efeito de substâncias",
    "Profissional abandonou o serviço", "Profissional recusou deveres acordados",
    "Comportamento fraudulento", "Conduta criminosa", "Violação ética grave", "Outra queixa grave",
]
PROFESSIONAL_TERMINATION_REASONS = [
    "Emergência médica", "Emergência pessoal", "Ambiente de trabalho inseguro",
    "Agressão do cliente", "Abuso verbal", "Violência física",
    "Condições inseguras", "Cliente solicitou encerramento", "Outro",
]

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
    booking.early_termination_reason = f"[{body.reason_category or 'general'}] {body.reason}" + (f": {body.detail}" if body.detail else "")

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

    # Grace period: free cancellation within 10 min if pro hasn't accepted and >7h before
    is_grace = minutes_since_creation <= GRACE_PERIOD_MINUTES and booking.status.value == "pending" and hours_until > 7

    if is_grace:
        refund_pct = 100
    elif hours_until > 7:
        refund_pct = 100
    elif hours_until >= 2:
        refund_pct = 50
    else:
        refund_pct = 0

    # #3: Grace period 3-use limit per 30 days
    if is_grace:
        from datetime import timedelta as td
        thirty_days_ago = now - td(days=30)
        grace_count = db.query(Booking).filter(
            Booking.user_id == booking.user_id,
            Booking.cancel_reason != None,
            Booking.cancel_reason.contains("grace"),
            Booking.cancelled_at > thirty_days_ago,
        ).count()
        if grace_count >= 3:
            is_grace = False
            # Falls through to standard policy
            if hours_until > 7:
                refund_pct = 100
            elif hours_until >= 2:
                refund_pct = 50
            else:
                refund_pct = 0

    # Update booking
    booking.status = BookingStatus.cancelled
    grace_tag = " (grace)" if is_grace else ""
    booking.cancel_reason = f"{body.reason}: {body.detail}{grace_tag}" if body.detail else f"{body.reason}{grace_tag}"
    booking.cancelled_by = body.cancelled_by
    booking.cancelled_at = now

    # #5: Progressive professional penalties
    if body.cancelled_by == "professional":
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if prof:
            prof.late_cancellations = (prof.late_cancellations or 0) + 1
            count = prof.late_cancellations

            # 90-day reset window check
            from datetime import timedelta as td
            ninety_days_ago = now - td(days=90)
            recent_cancels = db.query(Booking).filter(
                Booking.professional_id == booking.professional_id,
                Booking.cancelled_by == "professional",
                Booking.cancelled_at > ninety_days_ago,
            ).count()

            if recent_cancels <= 1:
                pass  # 1st: warning only
            elif recent_cancels == 2:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - 10)
            elif recent_cancels == 3:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - 15)
                prof.suspended_until = now + td(days=7)
                prof.is_available = False
            elif recent_cancels == 4:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - 25)
                prof.suspended_until = now + td(days=30)
                prof.is_available = False
            elif recent_cancels >= 5:
                prof.is_available = False  # permanent ban until admin review

    # #4: Progressive client penalties
    else:
        client = db.query(User).filter(User.id == booking.user_id).first()
        if client and not is_grace:
            client.reliability_score = max(0, (client.reliability_score or 100) - 3)
            # Check no-show count in 90 days
            from datetime import timedelta as td
            ninety_days_ago = now - td(days=90)
            no_show_count = db.query(Booking).filter(
                Booking.user_id == booking.user_id,
                Booking.cancel_reason.contains("no_show"),
                Booking.cancelled_at > ninety_days_ago,
            ).count()
            if no_show_count >= 3:
                client.reliability_score = max(0, (client.reliability_score or 100) - 15)

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

# ── #8: Exceptional Circumstances ──────────────────────────────────────────────

EXCEPTIONAL_REASONS = [
    "Emergência médica", "Hospitalização", "Falecimento de familiar direto",
    "Desastre natural", "Emergência governamental", "Outro (aprovação do admin)",
]

@router.post("/{booking_id}/exceptional-cancel")
def exceptional_cancel(booking_id: str, reason: str = "Emergência médica", db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Cancel under exceptional circumstances — goes to admin review."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    booking.status = BookingStatus.under_review
    booking.review_type = "cancellation"
    booking.cancel_reason = f"[EXCEPCIONAL] {reason}"
    booking.cancelled_by = current.role.value if hasattr(current.role, 'value') else "client"
    db.commit()
    return {"booking_id": booking_id, "status": "under_review", "review_type": "cancellation",
            "message": "Cancelamento sob análise. Um administrador irá revisar seu caso."}

# ── #12: GPS Exception Request ─────────────────────────────────────────────────

class GPSExceptionRequest(BaseModel):
    reason: str
    evidence_url: Optional[str] = None

@router.post("/{booking_id}/gps-exception")
def submit_gps_exception(booking_id: str, body: GPSExceptionRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Submit GPS exception when check-in/out fails due to technical issues."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    booking.status = BookingStatus.under_review
    booking.review_type = "gps_exception"
    booking.gps_exception_reason = body.reason
    booking.gps_exception_evidence = body.evidence_url
    db.commit()
    return {"booking_id": booking_id, "status": "under_review", "review_type": "gps_exception",
            "message": "Exceção GPS enviada. Aguardando análise do administrador."}

# ── #13: GPS Fraud Detection ──────────────────────────────────────────────────

def _check_gps_fraud(booking, db):
    """Auto-detect suspicious GPS activity and flag booking."""
    flags = []

    # Check if check-in immediately followed by checkout (< 5 min)
    if booking.actual_checkin and booking.actual_checkout:
        elapsed = (booking.actual_checkout - booking.actual_checkin).total_seconds() / 60
        if elapsed < 5:
            flags.append("check_in_checkout_too_fast")

    # Check if checkin distance is too far
    if booking.checkin_flagged:
        flags.append("checkin_outside_radius")

    if flags:
        booking.gps_fraud_flags = flags
        booking.gps_fraud_detected = True
        # Don't auto-cancel, just flag for admin
        return True
    return False

# ── #37: Late Arrival Logic ───────────────────────────────────────────────────

LATE_ARRIVAL_TOLERANCE_MINUTES = 10

@router.post("/{booking_id}/check-late-arrival")
def check_late_arrival(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Check if professional arrived late (>10 min after scheduled start)."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    if not booking.actual_checkin or not booking.scheduled_start:
        return {"late": False}

    scheduled = booking.scheduled_start.replace(tzinfo=timezone.utc) if booking.scheduled_start.tzinfo is None else booking.scheduled_start
    actual = booking.actual_checkin.replace(tzinfo=timezone.utc) if booking.actual_checkin.tzinfo is None else booking.actual_checkin
    delay_minutes = (actual - scheduled).total_seconds() / 60

    if delay_minutes > LATE_ARRIVAL_TOLERANCE_MINUTES:
        booking.late_arrival = True

        # Update professional's late arrival count
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if prof:
            # Count late arrivals in last 90 days
            ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
            late_count = db.query(Booking).filter(
                Booking.professional_id == booking.professional_id,
                Booking.late_arrival == True,
                Booking.actual_checkin > ninety_days_ago,
            ).count()

            # 1st-2nd: internal reliability only
            if late_count <= 2:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - 3)
            # 3rd+: also affects public rating
            else:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - 5)
                if prof.rating_avg and prof.rating_avg > 0:
                    prof.rating_avg = max(1.0, (prof.rating_avg or 5.0) - 0.1)

        db.commit()
        return {"late": True, "delay_minutes": round(delay_minutes), "penalty_level": "internal" if late_count <= 2 else "public"}

    return {"late": False, "delay_minutes": round(delay_minutes)}

# ── #38: Cancellation Audit Log ────────────────────────────────────────────────

@router.get("/{booking_id}/audit-log")
def get_booking_audit(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Return full audit log for a booking."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Only admin or booking participants can view
    if current.role.value != "admin":
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if booking.user_id != current.id and (not prof or prof.user_id != current.id):
            raise HTTPException(403, "Access denied")

    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()

    return {
        "booking_id": booking.id,
        "client_id": booking.user_id,
        "professional_id": booking.professional_id,
        "status": booking.status.value if hasattr(booking.status, 'value') else str(booking.status),
        "no_show_who": booking.no_show_who,
        "review_type": booking.review_type,
        "scheduled_start": booking.scheduled_start.isoformat() if booking.scheduled_start else None,
        "scheduled_end": booking.scheduled_end.isoformat() if booking.scheduled_end else None,
        "actual_checkin": booking.actual_checkin.isoformat() if booking.actual_checkin else None,
        "actual_checkout": booking.actual_checkout.isoformat() if booking.actual_checkout else None,
        "service_started_at": booking.service_started_at.isoformat() if booking.service_started_at else None,
        "actual_duration_minutes": booking.actual_duration_minutes,
        "cancelled_by": booking.cancelled_by,
        "cancel_reason": booking.cancel_reason,
        "cancelled_at": booking.cancelled_at.isoformat() if booking.cancelled_at else None,
        "late_arrival": booking.late_arrival,
        "checkin_flagged": booking.checkin_flagged,
        "checkin_distance": booking.checkin_distance,
        "gps_fraud_detected": getattr(booking, 'gps_fraud_detected', False),
        "early_termination": booking.early_termination,
        "early_termination_reason": booking.early_termination_reason,
        "has_dispute": booking.has_dispute,
        "dispute_reason": booking.dispute_reason,
        "emergency_name": booking.emergency_name,
        "emergency_phone": booking.emergency_phone,
        "reschedule_status": booking.reschedule_status,
        "match_batch": booking.match_batch,
        "payment": {
            "amount": payment.amount if payment else None,
            "commission": payment.commission if payment else None,
            "pro_payout": payment.pro_payout if payment else None,
            "method": payment.method if payment else None,
            "status": payment.status.value if payment and hasattr(payment.status, 'value') else None,
            "refund_amount": payment.refund_amount if payment else None,
        } if payment else None,
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
    }

# ── #9: Real-Time Service Extension ───────────────────────────────────────────

class ExtensionRequest(BaseModel):
    new_end_time:  datetime
    requested_by:  str  # "client" or "professional"

@router.post("/{booking_id}/request-extension")
def request_extension(booking_id: str, body: ExtensionRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Request to extend an in-progress booking. Requires mutual confirmation."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.status.value != "checked_in":
        raise HTTPException(400, "Extensão só é possível para atendimentos em andamento")

    # Calculate additional time and cost
    current_end = booking.scheduled_end
    new_end = body.new_end_time
    if new_end <= current_end:
        raise HTTPException(400, "Novo horário deve ser após o término atual")

    additional_minutes = (new_end - current_end).total_seconds() / 60

    # Calculate additional cost using pricing engine (no new Initial Fee)
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
    role = user.role.value if user and hasattr(user.role, 'value') else "caregiver"

    from app.utils.pricing import _count_day_night_minutes, HOUR_RATES
    split = _count_day_night_minutes(current_end, new_end)
    additional_day = round(split["day"] / 60 * HOUR_RATES[role]["day"], 2)
    additional_night = round(split["night"] / 60 * HOUR_RATES[role]["night"], 2)
    additional_cost = round(additional_day + additional_night, 2)

    # Check for schedule conflict
    conflicting = db.query(Booking).filter(
        Booking.professional_id == booking.professional_id,
        Booking.id != booking_id,
        Booking.status.in_(["accepted", "checked_in", "professional_arrived"]),
        Booking.scheduled_start < new_end,
        Booking.scheduled_end > current_end,
    ).first()

    booking.extension_new_end = new_end
    booking.extension_requested_by = body.requested_by
    booking.extension_additional_cost = additional_cost
    booking.extension_status = "requested"
    db.commit()

    return {
        "booking_id": booking_id,
        "extension_status": "requested",
        "additional_minutes": round(additional_minutes),
        "additional_cost": additional_cost,
        "has_conflict": conflicting is not None,
        "conflict_warning": "⚠️ Profissional tem outro atendimento agendado após este horário." if conflicting else None,
        "message": "Extensão solicitada. Aguardando confirmação da outra parte.",
    }

@router.patch("/{booking_id}/extension/confirm")
def confirm_extension(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Other party confirms the extension request."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.extension_status != "requested":
        raise HTTPException(400, "Nenhuma extensão pendente")

    booking.scheduled_end = booking.extension_new_end
    booking.extension_status = "confirmed"
    # Add cost to booking total
    if booking.extension_additional_cost:
        booking.total_price = (booking.total_price or 0) + booking.extension_additional_cost
    db.commit()

    return {
        "booking_id": booking_id, "extension_status": "confirmed",
        "new_end": booking.scheduled_end.isoformat(),
        "new_total": booking.total_price,
        "message": "Extensão confirmada. Horário e valor atualizados.",
    }

@router.patch("/{booking_id}/extension/decline")
def decline_extension(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Other party declines the extension."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    booking.extension_status = "declined"
    db.commit()
    return {"booking_id": booking_id, "extension_status": "declined", "message": "Extensão recusada."}