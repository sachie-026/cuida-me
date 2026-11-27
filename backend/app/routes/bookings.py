from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Booking, BookingStatus, User, Professional, Patient, Payment, PaymentStatus, DocStatus, Assessment
from app.utils.pricing import calculate_price, MINIMUM_PRICES, detect_shift, HOUR_RATES, INITIAL_SERVICE_FEE
from app.utils.holidays import check_date_for_holiday
from app.utils.notification_engine import fire_event

router = APIRouter(prefix="/bookings", tags=["bookings"])

class ServiceAddressPayload(BaseModel):
    """Change 44 — snapshot address captured at booking creation.
    All fields optional at the schema level so older frontend bundles don't 400;
    the create endpoint enforces the required subset (street, city, state)."""
    cep:          Optional[str] = None
    street:       Optional[str] = None
    number:       Optional[str] = None
    complement:   Optional[str] = None
    neighborhood: Optional[str] = None
    city:         Optional[str] = None
    state:        Optional[str] = None
    reference:    Optional[str] = None
    latitude:     Optional[float] = None
    longitude:    Optional[float] = None

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
    # Change 44 — optional at schema level, validated below if present
    service_address: Optional[ServiceAddressPayload] = None

class CheckInOut(BaseModel):
    lat: float
    lng: float

class CancelRequest(BaseModel):
    reason: Optional[str] = None

class BookingDetailsUpdate(BaseModel):
    """Fields the client can edit on an active booking.
    Only metadata — no price, no timing, no pro-approval needed."""
    notes:           Optional[str] = None
    emergency_name:  Optional[str] = None
    emergency_phone: Optional[str] = None

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

def _get_booking_client_user(booking: Booking, db: Session) -> "User | None":
    """Resolve the client User for a booking.
    Fast path: booking.user_id (set on creation).
    Fallback: patient_id → Patient → user_id (for old bookings before migration).
    """
    if booking.user_id:
        u = db.query(User).filter(User.id == booking.user_id).first()
        if u:
            return u
    # Fallback via patient chain
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    if patient and patient.user_id:
        return db.query(User).filter(User.id == patient.user_id).first()
    return None

def _get_booking_client_id(booking: Booking, db: Session) -> "str | None":
    """Return the client user_id for a booking (for access checks and queries)."""
    if booking.user_id:
        return booking.user_id
    patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
    return patient.user_id if patient else None

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
    # Client verification gate — check document verification
    if current.role.value == "client":
        if not current.is_verified:
            raise HTTPException(403, "Verifique sua identidade antes de agendar. Envie seus documentos no perfil.")
        # Phone verification — controlled by admin toggle
        from app.routes.settings import get_setting
        if get_setting("require_phone_verification", db) == "true":
            if not getattr(current, 'phone_verified', False):
                raise HTTPException(403, "Verifique seu telefone antes de agendar. Acesse Perfil → Verificar telefone.")

    # Minimum advance booking — read from admin settings (default 5h)
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from app.routes.settings import get_setting
    min_advance = float(get_setting("min_advance_hours", db) or 5)
    # Frontend sends naive local times (America/Sao_Paulo).
    # Compare in the same timezone to avoid UTC offset mismatch.
    tz_sp = ZoneInfo("America/Sao_Paulo")
    now_local = datetime.now(tz_sp)
    sched_local = body.scheduled_start
    if sched_local.tzinfo is not None:
        # If tz-aware, convert to SP
        sched_local = sched_local.astimezone(tz_sp).replace(tzinfo=None)
    # Both are naive São Paulo times — safe to compare
    hours_until = (sched_local - now_local.replace(tzinfo=None)).total_seconds() / 3600
    if hours_until < min_advance:
        raise HTTPException(400, f"O agendamento deve ser feito com no mínimo {int(min_advance)} horas de antecedência.")

    patient = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")

    # 3.5: Self-booking blocked — same person can't be both client and professional
    if hasattr(body, 'professional_id') and body.professional_id:
        pro = db.query(Professional).filter(Professional.id == body.professional_id).first()
        if pro and pro.user_id == current.id:
            raise HTTPException(400, "Não é possível agendar um atendimento consigo mesmo. Selecione outro profissional.")

    # Auto-detect holiday if not already set
    date_str = body.scheduled_start.strftime("%Y-%m-%d")
    holiday_info = check_date_for_holiday(date_str, db)
    is_holiday = body.is_holiday or holiday_info["is_holiday"]

    # State registration validation — pro can only work in their COREN state.
    # Change 44: prefer the structured service_address.state captured on the
    # booking payload (deterministic 2-letter UF). Fall back to parsing
    # patient.address, but with a WORD-BOUNDARY match so "PARANÁ" does not
    # register as "PA" (the previous substring-match bug).
    if hasattr(body, 'professional_id') and body.professional_id:
        pro = db.query(Professional).filter(Professional.id == body.professional_id).first()
        if pro and pro.council_state:
            pro_state = pro.council_state.upper()
            STATES = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
                      "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}
            patient_state = None
            # 1) Preferred — structured field from Change 44 payload
            sa = getattr(body, "service_address", None)
            if sa and getattr(sa, "state", None):
                cand = sa.state.strip().upper()
                if cand in STATES:
                    patient_state = cand
            # 2) Fallback — parse the patient profile address text with a
            # word-boundary regex so "PARANÁ" doesn't trigger "PA".
            if patient_state is None and patient and patient.address:
                import re
                addr_upper = patient.address.upper()
                for s in STATES:
                    if re.search(rf"\b{s}\b", addr_upper):
                        patient_state = s
                        break
            if patient_state and patient_state != pro_state:
                raise HTTPException(403, f"Este profissional possui registro COREN-{pro_state} e não pode atender no estado {patient_state}.")

    # Rule #4 (23/11/2026) — BUG FIX (24/11/2026): the 30-min travel buffer
    # must also be enforced at CREATION time, not only at /accept. Without
    # this, a client could submit a booking targeting a pro whose schedule
    # already has a conflicting slot (e.g. prior booking ending at 23:30,
    # new one starting at 23:30), and the pro's /accept step was the only
    # guard — if the pro never explicitly accepted via the UI (or the
    # backend change wasn't deployed), the conflicting row stayed in the DB.
    # Now we reject at creation with the same clear message used on /accept.
    if body.professional_id:
        conflict = _has_scheduling_conflict(
            body.professional_id, body.scheduled_start, body.scheduled_end, db
        )
        if conflict is not None:
            raise HTTPException(409, detail=_conflict_response_for(conflict, db))

    # Change 44 — snapshot the service address onto the booking row.
    # Required fields enforced here (schema has them optional to avoid breaking
    # old frontend bundles during rollout, which is a soft failure path, not a
    # silent one — if the frontend forgot to send the address we 400 here with
    # a clear message rather than hiding the omission).
    sa = body.service_address
    if not sa or not (sa.street and sa.city and sa.state):
        raise HTTPException(400, "Endereço de atendimento é obrigatório (rua, cidade e estado).")
    # Lat/lng — use what the client sent, otherwise geocode on the server as a
    # best-effort fallback. Missing coordinates are OK; GPS check-in simply
    # won't enforce a radius for this booking.
    sa_lat, sa_lng = sa.latitude, sa.longitude
    if sa_lat is None or sa_lng is None:
        try:
            from app.utils.geocoding import geocode_address
            full = ", ".join(x for x in [
                f"{sa.street}, {sa.number}" if sa.number else sa.street,
                sa.complement, sa.neighborhood, sa.city, sa.state,
                f"CEP {sa.cep}" if sa.cep else None,
            ] if x)
            coords = geocode_address(full)
            if coords:
                sa_lat, sa_lng = coords
        except Exception:
            pass

    server_price = _compute_price(body, db)
    booking_data = body.dict()
    booking_data.pop("service_address", None)  # flatten below instead
    booking_data["is_holiday"] = is_holiday
    booking_data.update({
        "service_street":       sa.street,
        "service_number":       sa.number,
        "service_complement":   sa.complement,
        "service_neighborhood": sa.neighborhood,
        "service_city":         sa.city,
        "service_state":        sa.state,
        "service_cep":          sa.cep,
        "service_reference":    sa.reference,
        "service_latitude":     sa_lat,
        "service_longitude":    sa_lng,
    })
    # Scheduled times are treated as bare wall-clock Brazilian time throughout
    # the app: stored as-is, returned as-is, displayed as-is. No TZ math.
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
    booking.user_id = current.id  # 1-fix: store client who created the booking
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # ── Notify: booking.requested → professional ──
    try:
        pro = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        pro_user = db.query(User).filter(User.id == pro.user_id).first() if pro else None
        if pro_user:
            booking_code = f"#{booking.id[:6].upper()}"
            fire_event(db, "booking.requested", {
                "client_name": current.full_name or "Cliente",
                "service": booking.service_type or "Cuidado",
                "booking_date": booking.scheduled_start.strftime("%d/%m"),
                "booking_time": f"{booking.scheduled_start.strftime('%Hh')}–{booking.scheduled_end.strftime('%Hh')}",
                "neighborhood": "",
                "booking_code": booking_code,
                "booking_id": booking.id,
                "response_deadline": "3h",
            }, recipient_users={"professional": [pro_user]})
            db.commit()

            # ── Notify: admin.booking_requested → admins ──
            admins = db.query(User).filter(User.role == "admin").all()
            if admins:
                fire_event(db, "admin.booking_requested", {
                    "client_name": current.full_name or "Cliente",
                    "professional_name": pro_user.full_name or "Profissional",
                    "service": booking.service_type or "Cuidado",
                    "booking_date": booking.scheduled_start.strftime("%d/%m"),
                    "booking_time": f"{booking.scheduled_start.strftime('%Hh')}–{booking.scheduled_end.strftime('%Hh')}",
                    "booking_code": booking_code,
                }, recipient_users={"admin": admins})
                db.commit()
    except Exception as e:
        print(f"[NOTIFY] booking.requested error: {e}")

    return booking

def _booking_to_dict(b: Booking, db: Session, enrich: bool = False) -> dict:
    """Serialize a Booking as a dict with all datetime offsets stripped.
    The app treats scheduled_start/end etc. as bare wall-clock Brazilian time —
    whatever string the frontend sent is what we return, so the browser displays
    the same hour regardless of its own timezone. `enrich=True` adds client /
    patient / professional display fields used by the booking detail modals."""
    row = {c.name: getattr(b, c.name) for c in b.__table__.columns}
    # Serialize status enum to its string value
    if row.get("status") is not None and hasattr(row["status"], "value"):
        row["status"] = row["status"].value
    # Strip tzinfo from every datetime field (so FastAPI emits "YYYY-MM-DDTHH:MM:SS"
    # with no "+00:00" offset) — browsers then render the stored hour as-is.
    for k, v in list(row.items()):
        if v is not None and hasattr(v, "tzinfo") and v.tzinfo is not None:
            row[k] = v.replace(tzinfo=None)
    if enrich:
        client_user = db.query(User).filter(User.id == b.user_id).first() if b.user_id else None
        row["client_name"]     = client_user.full_name if client_user else "Cliente"
        row["client_phone"]    = client_user.phone if client_user else None
        row["client_verified"] = bool(client_user and client_user.phone_verified) if client_user else False
        pro = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
        pro_user = db.query(User).filter(User.id == pro.user_id).first() if pro else None
        row["professional_name"]    = pro_user.full_name if pro_user else None
        # Expose the pro's user_id so the client-side rating flow knows who
        # to rate (Assessment.reviewee_id must be a user_id, not a pro_id).
        row["professional_user_id"] = pro_user.id if pro_user else None
        # Item 4 (24/11/2026) — urgency surcharge breakdown. The payment,
        # booking-detail and receipt screens render a "Adicional de urgência
        # (+X%)" line when this > 0. Computed from the pricing_snapshot
        # stored on the booking so a later Admin Panel change doesn't
        # rewrite historical amounts.
        row["urgency_fee_pct"]    = 0
        row["urgency_fee_amount"] = 0
        if b.is_urgent:
            try:
                from app.routes.settings import get_setting as _gs
                snap = b.pricing_snapshot or {}
                pct = float(snap.get("urgent_surcharge_pct",
                                    _gs("urgent_surcharge_pct", db) or 20))
                if pct > 0 and b.base_price:
                    row["urgency_fee_pct"]    = pct
                    row["urgency_fee_amount"] = round(float(b.base_price) * pct / 100, 2)
            except Exception:
                pass
        patient = db.query(Patient).filter(Patient.id == b.patient_id).first() if b.patient_id else None
        row["patient_name"] = patient.patient_name if patient else None

        # Change 44 — prefer the booking snapshot, fall back to patient.address
        # for bookings created before this change.
        has_snapshot = bool(b.service_street or b.service_city)
        if has_snapshot:
            full_parts = [
                f"{b.service_street}, {b.service_number}" if b.service_street and b.service_number else b.service_street,
                b.service_complement,
                b.service_neighborhood,
                f"{b.service_city} - {b.service_state}" if b.service_city and b.service_state else (b.service_city or b.service_state),
                f"CEP {b.service_cep}" if b.service_cep else None,
            ]
            row["address"]  = ", ".join(p for p in full_parts if p)
            row["city"]     = b.service_city
            row["approximate_location"] = ", ".join(p for p in [b.service_neighborhood, b.service_city] if p) or b.service_city
            row["latitude"]  = b.service_latitude  if b.service_latitude  is not None else (patient.latitude  if patient else None)
            row["longitude"] = b.service_longitude if b.service_longitude is not None else (patient.longitude if patient else None)
        else:
            row["address"] = patient.address if patient else None
            if patient and patient.address:
                parts = patient.address.split(",")
                row["city"] = parts[-2].strip() if len(parts) >= 2 else parts[0].strip()
                row["approximate_location"] = row["city"]
            else:
                row["city"] = None
                row["approximate_location"] = None
            row["latitude"]  = patient.latitude  if patient else None
            row["longitude"] = patient.longitude if patient else None
    return row

# ── STATIC single-segment routes MUST be declared BEFORE `/{booking_id}` ──
# FastAPI matches routes in declaration order. Any `@router.get("/foo")` placed
# AFTER `/{booking_id}` is silently intercepted (booking_id = "foo") and the
# client gets a 404. Do NOT add a new single-segment GET below the catch-all.

@router.get("/cancellation-reasons")
def get_cancellation_reasons():
    """Return list of valid cancellation reasons."""
    return {"reasons": CANCELLATION_REASONS}

@router.get("/my-bookings")
def get_my_bookings(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Return all bookings for the current user, auto-scoped by their role.
    - Client: bookings where they created the booking (user_id match) or own the patient.
    - Professional: bookings where they are the assigned pro.
    MUST be declared BEFORE `/{booking_id}` or the dynamic route eats this
    request and returns 404 (previous bug — Earnings and History both broke)."""
    bookings = []
    # Client side
    user_bookings = db.query(Booking).filter(Booking.user_id == current.id).all()
    for b in user_bookings:
        bookings.append(b)
    # Patient fallback (older rows where user_id wasn't set at creation)
    patient = db.query(Patient).filter(Patient.user_id == current.id).first()
    if patient:
        seen_ids = {b.id for b in bookings}
        for b in db.query(Booking).filter(Booking.patient_id == patient.id).all():
            if b.id not in seen_ids:
                bookings.append(b)
    # Pro side
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if prof:
        seen_ids = {b.id for b in bookings}
        for b in db.query(Booking).filter(Booking.professional_id == prof.id).all():
            if b.id not in seen_ids:
                bookings.append(b)
    # Order by scheduled_start desc (newest first). Normalize to naive so
    # tz-aware and naive values don't blow up when sorted together.
    def _sort_key(b):
        d = b.scheduled_start
        if d is None:
            return datetime.min
        return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    bookings.sort(key=_sort_key, reverse=True)

    # ── Rating-window enrichment (History: "Avaliar" / "Avaliado" badges) ──
    # Rule: once a booking is completed, the reviewer can rate the other
    # party. The window stays open until the reviewer's NEXT booking request
    # (any new Booking row created after this one's completion anchor),
    # then it expires. Already-rated bookings show "Avaliado" and can't be
    # re-rated (enforced server-side by the unique (booking_id, reviewer_id)
    # guard on Assessment too — this is purely to drive UI).
    booking_ids = [b.id for b in bookings]
    rated_ids: set = set()
    if booking_ids:
        rated_rows = db.query(Assessment.booking_id).filter(
            Assessment.booking_id.in_(booking_ids),
            Assessment.reviewer_id == current.id,
        ).all()
        rated_ids = {r[0] for r in rated_rows}

    # Pro's own id (if any), looked up once not per-booking.
    pro_id_for_window = prof.id if prof else None

    def _can_rate(b: Booking) -> bool:
        # Must be a completed, not-yet-rated booking the user was part of.
        if b.status != BookingStatus.completed: return False
        if b.id in rated_ids: return False
        side = None
        if b.user_id and b.user_id == current.id:
            side = "client"
        elif pro_id_for_window and b.professional_id == pro_id_for_window:
            side = "pro"
        if side is None: return False
        anchor = b.actual_checkout or b.scheduled_end or b.created_at
        if anchor is None: return True  # permissive if we can't compute
        q = db.query(Booking.id).filter(Booking.id != b.id, Booking.created_at > anchor)
        if side == "client":
            q = q.filter(Booking.user_id == current.id)
        else:
            q = q.filter(Booking.professional_id == pro_id_for_window)
        return q.first() is None

    result = []
    for b in bookings:
        d = _booking_to_dict(b, db, enrich=True)
        d["current_user_has_rated"] = b.id in rated_ids
        d["current_user_can_rate"]  = _can_rate(b)
        result.append(d)
    return result

@router.get("/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    return _booking_to_dict(b, db, enrich=True)

@router.get("/patient/{patient_or_user_id}")
def get_patient_bookings(patient_or_user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    patient = db.query(Patient).filter(Patient.id == patient_or_user_id).first()
    if not patient:
        patient = db.query(Patient).filter(Patient.user_id == patient_or_user_id).first()
    if not patient: raise HTTPException(404, "Patient not found")
    if patient.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")
    bookings = db.query(Booking).filter(
        Booking.patient_id == patient.id
    ).order_by(Booking.scheduled_start.desc()).all()
    return [_booking_to_dict(b, db, enrich=True) for b in bookings]

@router.get("/professional/{professional_id}")
def get_professional_bookings(professional_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    prof = db.query(Professional).filter(Professional.id == professional_id).first()
    if not prof: raise HTTPException(404, "Professional not found")
    if prof.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied")

    bookings = db.query(Booking).filter(
        Booking.professional_id == professional_id
    ).order_by(Booking.scheduled_start.desc()).all()

    # Auto-expire past pending bookings (safe — no payment was made yet).
    # We deliberately do NOT auto-complete past accepted bookings because the
    # normal checkout flow triggers Stripe payment release + wallet credits via
    # _do_release_payment; a status flip here would strand money in escrow.
    # Comparison uses naive wall-clock Brazilian time (strip any tz on either side).
    now_sp_naive = datetime.now(ZoneInfo("America/Sao_Paulo")).replace(tzinfo=None)
    changed = False
    for b in bookings:
        end_dt = b.scheduled_end
        if end_dt is not None and end_dt.tzinfo is not None:
            end_dt = end_dt.replace(tzinfo=None)
        if end_dt is not None and end_dt < now_sp_naive and b.status == BookingStatus.pending:
            b.status = BookingStatus.cancelled
            b.cancel_reason = "Expirado automaticamente"
            b.cancelled_by = "system"
            b.cancelled_at = datetime.now(timezone.utc)
            changed = True
    if changed:
        db.commit()

    return [_booking_to_dict(b, db, enrich=True) for b in bookings]

@router.patch("/{booking_id}/details")
def update_booking_details(
    booking_id: str,
    body: BookingDetailsUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Client-only edit of non-sensitive booking fields.
    Allowed fields: notes, emergency_name, emergency_phone.
    Blocked once the booking is a finalized record (completed / cancelled / no_show)."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Ownership — only the client who booked (or admin) can edit
    client_id = _get_booking_client_id(booking, db)
    if client_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Apenas o cliente pode editar este agendamento.")

    # Status gate — finalized bookings are immutable
    finalized = {BookingStatus.completed, BookingStatus.cancelled, BookingStatus.no_show}
    if booking.status in finalized:
        raise HTTPException(400, "Não é possível editar um agendamento finalizado.")

    # Apply only provided fields (None means "don't touch")
    changed = []
    if body.notes is not None:
        booking.notes = body.notes
        changed.append("notes")
    if body.emergency_name is not None:
        booking.emergency_name = body.emergency_name or None
        changed.append("emergency_name")
    if body.emergency_phone is not None:
        booking.emergency_phone = body.emergency_phone or None
        changed.append("emergency_phone")

    if not changed:
        raise HTTPException(400, "Nenhuma alteração enviada.")

    db.commit()
    db.refresh(booking)
    return {
        "booking_id": booking.id,
        "updated_fields": changed,
        "notes": booking.notes,
        "emergency_name": booking.emergency_name,
        "emergency_phone": booking.emergency_phone,
    }

@router.patch("/{booking_id}/accept")
def accept_booking(booking_id: str, accept_caregiver_terms: bool = False, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    _check_booking_access(b, current, db)
    if b.status != BookingStatus.pending:
        raise HTTPException(400, "Can only accept pending bookings")

    # Rule #4 (23/11/2026) — 30-min travel buffer. A pro cannot accept a
    # booking whose scheduled window is within 30 min of another of their
    # commitments. 409 so the frontend can show a specific "too close to
    # another booking" toast rather than the generic 400.
    conflict = _has_scheduling_conflict(
        b.professional_id, b.scheduled_start, b.scheduled_end, db,
        exclude_booking_id=b.id,
    )
    if conflict is not None:
        raise HTTPException(409, detail=_conflict_response_for(conflict, db))

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
    # Item 10 (24/11/2026) — set the client payment deadline. Tiered by
    # urgent vs standard; sweep in notification_scheduler auto-cancels the
    # booking and frees the slot if the client doesn't pay in time.
    try:
        from app.routes.settings import get_setting as _get_setting
        _now = datetime.now(timezone.utc)
        if b.is_urgent:
            _mins = int(_get_setting("client_payment_deadline_urgent_min", db) or 15)
        else:
            _mins = int(_get_setting("client_payment_deadline_standard_min", db) or 60)
        b.payment_deadline = _now + timedelta(minutes=_mins)
    except Exception as _e:
        print(f"[ACCEPT] payment_deadline set failed: {_e}")
    db.commit()
    db.refresh(b)

    # ── Notify: booking.accepted → client ──
    try:
        _prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
        pro_user = db.query(User).filter(User.id == _prof.user_id).first() if _prof else None
        client_user = _get_booking_client_user(b, db)
        booking_code = f"#{b.id[:6].upper()}"
        if client_user:
            fire_event(db, "booking.accepted", {
                "professional_name": (pro_user.full_name if pro_user else "Profissional"),
                "service": b.service_type or "Cuidado",
                "booking_date": b.scheduled_start.strftime("%d/%m"),
                "booking_time": f"{b.scheduled_start.strftime('%Hh')}–{b.scheduled_end.strftime('%Hh')}",
                "booking_code": booking_code,
                "booking_id": b.id,
            }, recipient_users={"client": [client_user]})
            db.commit()

        # ── Notify: admin.booking_accepted → admins ──
        admins = db.query(User).filter(User.role == "admin").all()
        if admins:
            fire_event(db, "admin.booking_accepted", {
                "professional_name": (pro_user.full_name if pro_user else "Profissional"),
                "client_name": (client_user.full_name if client_user else "Cliente"),
                "service": b.service_type or "Cuidado",
                "booking_date": b.scheduled_start.strftime("%d/%m"),
                "booking_code": booking_code,
            }, recipient_users={"admin": admins})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] booking.accepted error: {e}")

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
    # Rule (23/11/2026) — same 30-min cap applied to the legacy PATCH path.
    _check_finish_time_gate(b, db)
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

    # ── Notify: booking.cancelled_by_client or booking.cancelled_by_professional ──
    try:
        pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
        client_user = _get_booking_client_user(b, db)
        booking_code = f"#{b.id[:6].upper()}"
        cancel_vars = {
            "service": b.service_type or "Cuidado",
            "booking_date": b.scheduled_start.strftime("%d/%m"),
            "booking_code": booking_code,
            "booking_id": b.id,
            "cancellation_reason": body.reason or "Não informado",
        }
        if cancelled_by == "client" and pro_user:
            cancel_vars["client_name"] = current.full_name or "Cliente"
            fire_event(db, "booking.cancelled_by_client", cancel_vars,
                       recipient_users={"professional": [pro_user]})
        elif cancelled_by == "professional" and client_user:
            cancel_vars["professional_name"] = current.full_name or "Profissional"
            fire_event(db, "booking.cancelled_by_professional", cancel_vars,
                       recipient_users={"client": [client_user]})
        db.commit()
    except Exception as e:
        print(f"[NOTIFY] booking.cancel error: {e}")

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
    if _get_booking_client_id(booking, db) != current.id:
        raise HTTPException(403, "Only the client can request a reschedule")
    if booking.status.value not in ("pending", "accepted"):
        raise HTTPException(400, "Só é possível reagendar atendimentos pendentes ou aceitos")

    hours_until = (booking.scheduled_start - datetime.now(timezone.utc)).total_seconds() / 3600
    if hours_until < 12:
        raise HTTPException(400, "Reagendamento só é permitido com mais de 12 horas de antecedência")

    # Store the reschedule request — treat scheduled times as bare wall-clock
    # Brazilian time, pass through unchanged.
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
    if _get_booking_client_id(booking, db) != current.id:
        raise HTTPException(403, "Only the client can confirm")
    if booking.status.value != "checked_in":
        raise HTTPException(400, "Professional hasn't checked in yet")

    booking.client_confirmed_start = True
    db.commit()
    return {"booking_id": booking_id, "client_confirmed_start": True}

# Rule #1 (23/11/2026): client-side GPS-failure exception. Unlocks the pro's
# ability to start the service after the T+30 window has closed. Also flags
# the booking for admin review so ops can look into why the normal start was
# missed. Idempotent — safe to call more than once; the second call is a no-op
# that still returns the current state.
@router.post("/{booking_id}/confirm-pro-presence")
def confirm_pro_presence(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client confirms the professional is physically on site even though the
    service hasn't been checked in yet (typically because T+30 passed and the
    pro can't start on their own). The pro's start window reopens for this
    booking only, and the row is flagged for admin review."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(booking, db) != current.id:
        raise HTTPException(403, "Only the client can confirm the professional's presence.")
    status_now = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_now not in ("accepted", "professional_arrived"):
        raise HTTPException(
            400,
            "Esta confirmação só está disponível enquanto o atendimento ainda não foi iniciado."
        )

    already = bool(getattr(booking, "client_confirmed_pro_presence", False))
    booking.client_confirmed_pro_presence = True
    # Keep review_type sticky: don't overwrite if it already says something
    # more specific (e.g. "serious_complaint"). "gps_exception" is the
    # correct category for admin triage.
    if not booking.review_type:
        booking.review_type = "gps_exception"
    if not booking.gps_exception_reason:
        booking.gps_exception_reason = (
            "Cliente confirmou presença do profissional após o prazo de 30 min."
        )
    db.commit()

    if not already:
        # Notify the pro so they know the client has unlocked start. Fallback
        # quietly on failure — the state change above is the thing that
        # matters; the notification is a convenience.
        try:
            prof = db.query(Professional).filter(Professional.id == booking.professional_id).first() if booking.professional_id else None
            pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
            if pro_user:
                fire_event(db, "service.client_confirmed_pro_presence", {
                    "client_name": current.full_name or "Cliente",
                    "service": booking.service_type or "Cuidado",
                    "booking_code": f"#{booking.id[:6].upper()}",
                    "booking_id": booking.id,
                }, recipient_users={"professional": [pro_user]})
                db.commit()
        except Exception as e:
            print(f"[CONFIRM-PRO-PRESENCE] notify failed for {booking.id}: {e}")

    return {
        "booking_id": booking_id,
        "client_confirmed_pro_presence": True,
        "review_type": booking.review_type,
    }

@router.patch("/{booking_id}/confirm-checkout")
def confirm_checkout(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client confirms the service was completed satisfactorily.
    Triggers automatic payment release to professional via Stripe Connect."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(booking, db) != current.id:
        raise HTTPException(403, "Only the client can confirm")

    booking.client_confirmed_end = True
    db.commit()

    # Auto-release payment when client confirms checkout
    payment_released = False
    try:
        payment = db.query(Payment).filter(
            Payment.booking_id == booking_id,
            Payment.status == PaymentStatus.held,
        ).first()
        if payment and booking.status == BookingStatus.completed and not booking.has_dispute:
            from app.routes.payments import _do_release_payment
            _do_release_payment(payment, booking, db)
            payment_released = True
    except Exception as e:
        print(f"[AUTO-RELEASE] Error on confirm-checkout for booking {booking_id}: {e}")

    return {
        "booking_id": booking_id,
        "client_confirmed_end": True,
        "payment_released": payment_released,
    }

@router.post("/{booking_id}/report-issue")
def report_issue(booking_id: str, reason: str = "Problema com o atendimento", db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client reports an issue instead of confirming."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(booking, db) != current.id:
        raise HTTPException(403, "Only the client can report issues")

    booking.has_dispute = True
    booking.dispute_reason = reason
    db.commit()
    return {"booking_id": booking_id, "has_dispute": True, "reason": reason}

# ── #14: GPS Check-In/Check-Out ───────────────────────────────────────────────

class CheckInRequest(BaseModel):
    latitude:  float
    longitude: float

# Rule #7 (23/11/2026) — time-gate values below are dynamic. The module-
# level constants are fallback defaults; the real values come from
# PlatformSettings via `_time_cfg()` on every request, so an admin edit in
# the Admin Panel takes effect immediately with no redeploy.
def _time_cfg(db: Session) -> dict:
    """Return the current time-gate values from PlatformSettings, falling
    back to the module-level constants if the settings row / helper is not
    available (e.g. during very early boot). Keys match the Admin Panel's
    field names."""
    try:
        from app.routes.settings import get_setting
        return {
            "start_before":   int(get_setting("start_window_before_min",  db) or EARLY_START_WINDOW_MINUTES),
            "late_arrival":   int(get_setting("late_arrival_after_min",   db) or LATE_ARRIVAL_AFTER_MINUTES),
            "start_after":    int(get_setting("start_window_after_min",   db) or MAX_START_LATE_MINUTES),
            "finish_after":   int(get_setting("finish_window_after_min",  db) or MAX_FINISH_LATE_MINUTES),
            "min_gap":        int(get_setting("min_gap_between_bookings_min", db) or MIN_GAP_MINUTES),
            "ext_step":       int(get_setting("extension_step_min",       db) or EXTENSION_STEP_MINUTES),
        }
    except Exception:
        return {
            "start_before": EARLY_START_WINDOW_MINUTES,
            "late_arrival": LATE_ARRIVAL_AFTER_MINUTES,
            "start_after":  MAX_START_LATE_MINUTES,
            "finish_after": MAX_FINISH_LATE_MINUTES,
            "min_gap":      MIN_GAP_MINUTES,
            "ext_step":     EXTENSION_STEP_MINUTES,
        }


CHECK_IN_RADIUS_METERS = 500   # soft radius — beyond this, a booking is
                               # flagged for audit but NOT blocked. Covers
                               # ordinary mobile GPS drift (a pro parked across
                               # the street, indoors in a tall building, etc.).
CHECK_IN_HARD_BLOCK_METERS = 2000  # hard block — beyond this the pro is
                                   # clearly not on site. Returns 400 and
                                   # points the pro to the GPS-exception flow
                                   # at /{id}/gps-exception for legitimate
                                   # edge cases.

# Bug fix (25/11/2026) — scheduled_start / scheduled_end are stored as
# naive datetimes meant to be wall-clock Brazilian time. Treating them as
# UTC with `.replace(tzinfo=timezone.utc)` was off by the SP→UTC offset
# (3 h), so the time-gate helpers I added opened and closed windows 3 h
# too early. Use this helper everywhere a scheduled_* column is compared
# against datetime.now(timezone.utc).
_TZ_SP_SCHED = ZoneInfo("America/Sao_Paulo")

def _sched_to_utc(dt):
    """Scheduled times represent wall-clock Brazilian time (how the rest of
    the codebase treats them — display, strftime, frontend Date()). The
    DB column is TIMESTAMPTZ, so SQLAlchemy may return naive OR tz-aware
    UTC depending on driver/row; in BOTH cases the stored hour IS the
    Brazilian wall-clock hour (the write path never converts SP → UTC).
    Strip any claimed tzinfo, re-interpret as São Paulo, convert to real
    UTC for comparison with datetime.now(timezone.utc).
    Bug fix (27/11/2026) — supersedes the 25/11 half-fix which only
    handled the naive branch."""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        dt = dt.replace(tzinfo=None)
    return dt.replace(tzinfo=_TZ_SP_SCHED).astimezone(timezone.utc)


# Rule #3 (21/11/2026): a professional can only hit "Iniciar atendimento"
# starting 10 minutes before the scheduled start time.
# Rule #1 (23/11/2026): the start window closes 30 minutes AFTER the scheduled
# start. Between +15 and +30 the start is still allowed but is logged as a
# Late Arrival (late_arrival=True). Past +30 the pro is blocked UNLESS the
# client has confirmed presence via /confirm-pro-presence (sets
# client_confirmed_pro_presence=True on the booking + flags for admin review).
EARLY_START_WINDOW_MINUTES = 10
LATE_ARRIVAL_AFTER_MINUTES  = 15
MAX_START_LATE_MINUTES      = 30
# Rule (23/11/2026): the pro can finish up to 30 min past scheduled_end on
# their own. Past that, the system auto-finishes at scheduled_end (payment
# stays on scheduled time) and flags the row for admin review. Staying
# longer requires the Service Extension flow — the 30-min grace is not free
# extra time.
MAX_FINISH_LATE_MINUTES    = 30


def _check_start_time_gate(booking: "Booking", db: Session = None) -> None:
    """Enforce the start window. Raises 400 if outside it.

    - too early (now < scheduled_start - start_before min) → block with "faltam N min"
    - too late  (now > scheduled_start + start_after min)  → block UNLESS the
      client has confirmed pro presence (overrides, flags for admin review).

    Values default to module constants; if `db` is provided, PlatformSettings
    override them so an admin edit takes effect immediately.
    """
    # Bug fix (25/11/2026) — scheduled_start is wall-clock Brazilian.
    sched = _sched_to_utc(booking.scheduled_start)
    if sched is None:
        return
    now_utc = datetime.now(timezone.utc)

    cfg = _time_cfg(db) if db is not None else None
    before_min = cfg["start_before"] if cfg else EARLY_START_WINDOW_MINUTES
    after_min  = cfg["start_after"]  if cfg else MAX_START_LATE_MINUTES

    earliest = sched - timedelta(minutes=before_min)
    if now_utc < earliest:
        remaining = earliest - now_utc
        mins_left = max(1, int(remaining.total_seconds() // 60) + 1)
        raise HTTPException(
            400,
            f"Você poderá iniciar o atendimento {before_min} minutos antes do horário agendado. "
            f"Faltam {mins_left} min."
        )

    latest = sched + timedelta(minutes=after_min)
    if now_utc > latest:
        if getattr(booking, "client_confirmed_pro_presence", False):
            return
        raise HTTPException(
            400,
            f"O prazo de {after_min} minutos para iniciar o atendimento expirou. "
            "Peça ao cliente para confirmar sua presença no app, ou aguarde a "
            "reatribuição automática."
        )
    return


# Rule #4 (23/11/2026) — minimum gap between two bookings of the same pro.
# A pro cannot accept, or be matched to, a booking whose scheduled window
# comes within this many minutes of another of their bookings. 30 min is
# the committed travel/handover buffer: if service A ends at 14:00, the
# earliest start for service B is 14:30.
MIN_GAP_MINUTES = 30


def _has_scheduling_conflict(
    pro_id,
    new_start,
    new_end,
    db: Session,
    exclude_booking_id=None,
):
    """Return a conflicting Booking of the pro, or None.

    Two bookings conflict when their [start, end] windows (padded by
    MIN_GAP_MINUTES) overlap — equivalent to "the gap between them is less
    than 30 min". The symmetric form avoids edge-case bugs: for A(end=14:00)
    and B(start=14:30) the gap is exactly 30 min → allowed (14:00+30 >
    14:30 is False, so no conflict).

    Only active future-ish statuses are considered a commitment:
        pending, accepted, professional_arrived, checked_in.
    cancelled / no_show / completed / under_review are not blocking — the
    pro is no longer committed to those slots.

    Scheduled times are compared as naive wall-clock (matches the rest of
    the codebase's TZ discipline).
    """
    if not pro_id or new_start is None or new_end is None:
        return None

    def _naive(d):
        return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d

    ns = _naive(new_start)
    ne = _naive(new_end)
    if ne <= ns:
        return None  # malformed window — defer to higher-level validation

    active = [
        BookingStatus.pending,
        BookingStatus.accepted,
        BookingStatus.professional_arrived,
        BookingStatus.checked_in,
    ]
    q = db.query(Booking).filter(
        Booking.professional_id == pro_id,
        Booking.status.in_(active),
        Booking.scheduled_start.isnot(None),
        Booking.scheduled_end.isnot(None),
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)

    cfg = _time_cfg(db)
    gap = timedelta(minutes=cfg["min_gap"])
    for other in q.all():
        os = _naive(other.scheduled_start)
        oe = _naive(other.scheduled_end)
        # Padded-interval overlap: a conflict iff
        #   (other.end + gap > new.start) AND (new.end + gap > other.start)
        if oe + gap > ns and ne + gap > os:
            return other
    return None


def _conflict_response_for(other: "Booking", db: Session = None):
    """Build the 409 detail payload for a scheduling conflict. Reads the
    current min_gap from PlatformSettings via _time_cfg so the message and
    payload match whatever the admin set in the panel."""
    cfg = _time_cfg(db) if db is not None else {"min_gap": MIN_GAP_MINUTES}
    gap = cfg["min_gap"]
    start_iso = other.scheduled_start.isoformat() if other.scheduled_start else None
    end_iso   = other.scheduled_end.isoformat()   if other.scheduled_end   else None
    return {
        "code": "scheduling_conflict",
        "conflict_booking_id":    other.id,
        "conflict_booking_code":  f"#{other.id[:6].upper()}",
        "conflict_service_type":  other.service_type or "Cuidado",
        "conflict_scheduled_start": start_iso,
        "conflict_scheduled_end":   end_iso,
        "min_gap_minutes":        gap,
        "message": (
            f"Este agendamento está muito perto de outro atendimento seu. "
            f"É necessário um intervalo mínimo de {gap} minutos entre atendimentos."
        ),
    }


def _find_blocking_booking(current_pro: "Professional", this_booking: "Booking", db: Session):
    """Rule (23/11/2026) — a pro cannot start a new service while a previous
    one is still open. "Open" = status in (checked_in, professional_arrived).

    An open booking stops blocking once it's past its hard-sweep deadline
    (T_end+30 for checked_in — auto-finish; or T_start+30 for
    professional_arrived without a real check-in — auto-no-show), since the
    scheduler would finalize it within the next 5 min anyway. That window
    prevents the pro from being deadlocked if the sweep hasn't run yet.

    Returns the blocking Booking (or None). The caller decides whether to
    raise (start handlers do) or ignore (admin tools don't).
    """
    if not current_pro:
        return None
    now_utc = datetime.now(timezone.utc)
    active = [BookingStatus.checked_in, BookingStatus.professional_arrived]
    rows = db.query(Booking).filter(
        Booking.professional_id == current_pro.id,
        Booking.status.in_(active),
        Booking.id != this_booking.id,
    ).all()
    for b in rows:
        status_val = b.status.value if hasattr(b.status, "value") else str(b.status)
        if status_val == "checked_in":
            # Would auto-finish at scheduled_end + 30.
            # Bug fix (25/11/2026) — wall-clock Brazilian → UTC.
            end = _sched_to_utc(b.scheduled_end)
            if end is not None and now_utc > end + timedelta(minutes=MAX_FINISH_LATE_MINUTES):
                continue  # effectively over, don't block
        else:  # professional_arrived — legacy, would auto-no-show at start+30
            start = _sched_to_utc(b.scheduled_start)
            if start is not None and now_utc > start + timedelta(minutes=MAX_START_LATE_MINUTES):
                continue
        return b
    return None


def _block_response_for(b: "Booking", db: Session):
    """Build the 409 detail payload for the frontend "Finish previous first?"
    dialog. Includes just enough context for the pro to know which booking
    they still owe and what service it was."""
    # Resolve the patient's display name (best-effort — the pro has read
    # access to this through their own booking, so no privacy concern).
    patient_name = None
    if b.patient_id:
        patient = db.query(Patient).filter(Patient.id == b.patient_id).first()
        if patient:
            patient_name = getattr(patient, "full_name", None) or getattr(patient, "name", None)
    status_val = b.status.value if hasattr(b.status, "value") else str(b.status)
    return {
        "code": "pro_busy",
        "blocking_booking_id":    b.id,
        "blocking_service_type":  b.service_type or "Cuidado",
        "blocking_booking_code":  f"#{b.id[:6].upper()}",
        "blocking_scheduled_end": b.scheduled_end.isoformat() if b.scheduled_end else None,
        "blocking_scheduled_start": b.scheduled_start.isoformat() if b.scheduled_start else None,
        "blocking_patient_name":  patient_name,
        "blocking_status":        status_val,
        "message": (
            "Você precisa finalizar o atendimento anterior primeiro. "
            "Finalize agora para iniciar o próximo."
        ),
    }


def _check_finish_time_gate(booking: "Booking", db: Session = None) -> None:
    """Enforce the finish window. Raises 400 past scheduled_end + finish_after min.

    Rationale:
    - Checking out early is handled separately by the pricing-recalc block in
      the checkout endpoint — this gate only cares about the upper bound.
    - Past T_end+30 the scheduler's auto-finish sweep normally fires first
      and flips status to completed, so /checkout would then 400 on status.
      But the sweep runs every 5 min, so there is a small window where the
      sweep hasn't run yet and the pro is way past the cutoff — that case
      is what this gate guards against: block, tell them to use the
      extension flow next time, and let the sweep catch up.
    - No gate when scheduled_end is missing (data issue, don't lock pro out).
    """
    # Bug fix (25/11/2026) — scheduled_end is wall-clock Brazilian.
    sched_end = _sched_to_utc(booking.scheduled_end)
    if sched_end is None:
        return
    now_utc = datetime.now(timezone.utc)
    cfg = _time_cfg(db) if db is not None else None
    cap_min = cfg["finish_after"] if cfg else MAX_FINISH_LATE_MINUTES
    cutoff = sched_end + timedelta(minutes=cap_min)
    if now_utc <= cutoff:
        return
    raise HTTPException(
        400,
        f"O prazo de {cap_min} minutos para finalizar o atendimento expirou. "
        "O sistema finalizará automaticamente com base no horário agendado. "
        "Para estender o atendimento, use o fluxo de extensão antes do término."
    )


def _mark_late_arrival_if_applicable(booking: "Booking", db: Session, current_user: "User") -> bool:
    """If the service is being started 15+ min past scheduled_start, mark the
    booking as a late arrival, bump the counter, and fire service.late_arrival
    to both sides. Returns True iff it fired. Called from the start handlers
    AFTER the time gate passes, so we know we're within [T+15, T+30] or the
    client-confirmed override window."""
    # Bug fix (25/11/2026) — scheduled_start is wall-clock Brazilian.
    sched = _sched_to_utc(booking.scheduled_start)
    if sched is None:
        return False
    now_utc = datetime.now(timezone.utc)
    cfg = _time_cfg(db) if db is not None else None
    late_after = cfg["late_arrival"] if cfg else LATE_ARRIVAL_AFTER_MINUTES
    if now_utc < sched + timedelta(minutes=late_after):
        return False
    if booking.late_arrival:
        return False  # already flagged (sweep may have beat us to it)
    booking.late_arrival = True
    booking.late_arrival_count = (booking.late_arrival_count or 0) + 1
    try:
        from app.utils.notification_engine import fire_event
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first() if booking.professional_id else None
        pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
        client_user = _get_booking_client_user(booking, db)
        recipients = {}
        if client_user: recipients["client"] = [client_user]
        if pro_user:    recipients["professional"] = [pro_user]
        if recipients:
            fire_event(db, "service.late_arrival", {
                "professional_name": (pro_user.full_name if pro_user else "Profissional"),
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
            }, recipient_users=recipients)
    except Exception as e:
        print(f"[LATE-ARRIVAL] inline notify failed for {booking.id}: {e}")
    return True


def _check_start_gps(booking: "Booking", lat: float, lng: float, db: Session):
    """Soft-flag + hard-block GPS check for start/check-in.

    Returns (flagged: bool, distance_m: Optional[int]). Also mutates the
    booking row: writes checkin_flagged / checkin_distance so the audit
    trail is correct whether we flag or block.

    - distance <= 500m          → ok, not flagged
    - 500m < distance <= 2000m  → soft flag (allow), caller returns a
                                  warning to the frontend
    - distance > 2000m          → HTTPException(400), hard block, pro
                                  must correct their location or submit a
                                  GPS exception via /{id}/gps-exception
    - target coords missing     → no check (returns False, None)
    """
    target_lat = booking.service_latitude
    target_lng = booking.service_longitude
    if target_lat is None or target_lng is None:
        patient = db.query(Patient).filter(Patient.id == booking.patient_id).first()
        if patient:
            target_lat = getattr(patient, "latitude", None) or getattr(patient, "lat", None)
            target_lng = getattr(patient, "longitude", None) or getattr(patient, "lng", None)
    if target_lat is None or target_lng is None:
        return (False, None)
    try:
        distance = _haversine_meters(lat, lng, target_lat, target_lng)
    except Exception:
        return (False, None)
    rounded = round(distance)
    if distance > CHECK_IN_HARD_BLOCK_METERS:
        # Record on the row even though we're about to reject — so admin can
        # see the attempt and the pro's reported coords.
        booking.checkin_flagged = True
        booking.checkin_distance = rounded
        raise HTTPException(
            400,
            f"Você está a {rounded}m do endereço do atendimento, muito longe para "
            f"iniciar. Aproxime-se do local ou registre uma exceção de GPS no aplicativo."
        )
    if distance > CHECK_IN_RADIUS_METERS:
        booking.checkin_flagged = True
        booking.checkin_distance = rounded
        return (True, rounded)
    booking.checkin_flagged = False
    booking.checkin_distance = rounded
    return (False, rounded)


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

    # Rule (23/11/2026) — block if the pro still has another open service.
    blocker = _find_blocking_booking(prof, booking, db)
    if blocker is not None:
        raise HTTPException(409, detail=_block_response_for(blocker, db))

    # Rule #3 + Rule #1 — same time gate applied to the legacy two-step
    # check-in path so it can't be used to bypass the one-shot start.
    _check_start_time_gate(booking, db)

    # Store GPS, validate via helper (soft flag 500–2000m, hard block > 2km).
    booking.checkin_lat = body.latitude
    booking.checkin_lng = body.longitude
    booking.actual_checkin = datetime.now(timezone.utc)
    booking.status = BookingStatus.professional_arrived
    _check_start_gps(booking, body.latitude, body.longitude, db)

    # Late-arrival audit (matches start-service-combined behaviour).
    _mark_late_arrival_if_applicable(booking, db, current)

    # Start 15-min arrival waiting timer
    booking.arrival_timer_start = datetime.now(timezone.utc)

    db.commit()

    # ── Notify: service.professional_arrived → client ──
    try:
        client_user = _get_booking_client_user(booking, db)
        if client_user:
            fire_event(db, "service.professional_arrived", {
                "professional_name": current.full_name or "Profissional",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] service.professional_arrived error: {e}")

    return {
        "booking_id": booking_id, "status": "checked_in",
        "checkin_time": booking.actual_checkin.isoformat(),
        "flagged": booking.checkin_flagged,
        "message": "Check-in realizado. Clique em 'Iniciar Serviço' quando o cliente estiver disponível." if not booking.checkin_flagged
                   else "⚠️ Check-in registrado, mas a localização está fora do raio esperado.",
    }

@router.get("/with-partner/{partner_user_id}")
def get_active_booking_with_partner(
    partner_user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Change 44a — returns the most recent currently-active booking between the
    current user and a chat partner. Used by the Messages page to decide which
    quick-message chips to show. Returns null if no active booking exists."""
    active = [BookingStatus.accepted, BookingStatus.professional_arrived, BookingStatus.checked_in]
    # Walk current user's bookings as either client or professional, find one
    # whose other side matches the partner.
    bookings = db.query(Booking).filter(
        Booking.status.in_(active),
    ).order_by(Booking.scheduled_start.desc()).all()
    for b in bookings:
        prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
        pro_user_id = prof.user_id if prof else None
        client_user_id = _get_booking_client_id(b, db)
        pair_a = {current.id, partner_user_id}
        pair_b = {pro_user_id, client_user_id}
        if None in pair_b:
            continue
        if pair_a == pair_b:
            return _booking_to_dict(b, db, enrich=True)
    return None

class QuickMessageRequest(BaseModel):
    """Change 44a — kind of one-tap message to fire.
    "on_the_way"       : pro → client (I'm on my way)
    "client_ready"     : client → pro ("Pode chegar")
    "client_waiting"   : client → pro ("Estou aguardando")"""
    message_type: str

@router.post("/{booking_id}/quick-message")
def quick_message(
    booking_id: str,
    body: QuickMessageRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Fire a dedicated quick-message notification event (not a chat message).
    Enforces that only the correct side can send each kind, and that the
    booking status is sane (accepted / professional_arrived / checked_in).
    Idempotent-ish: the notification engine already dedupes identical
    deliveries by (user_id, event_key, booking_id)."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    status_now = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_now not in ("accepted", "professional_arrived", "checked_in"):
        raise HTTPException(400, "Mensagem rápida indisponível para este status.")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first() if booking.professional_id else None
    pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
    client_user = _get_booking_client_user(booking, db)

    is_pro    = pro_user    and current.id == pro_user.id
    is_client = client_user and current.id == client_user.id

    base_vars = {
        "service":      booking.service_type or "Cuidado",
        "booking_code": f"#{booking.id[:6].upper()}",
        "booking_id":   booking.id,
    }

    kind = (body.message_type or "").strip().lower()

    if kind == "on_the_way":
        if not is_pro:
            raise HTTPException(403, "Apenas o profissional pode enviar esta mensagem.")
        if not client_user:
            raise HTTPException(404, "Cliente não encontrado.")
        try:
            fire_event(db, "service.on_the_way", {
                **base_vars,
                "professional_name": current.full_name or "Profissional",
            }, recipient_users={"client": [client_user]})
            db.commit()
        except Exception as e:
            print(f"[NOTIFY] service.on_the_way error: {e}")
        return {"ok": True, "message_type": kind}

    if kind in ("client_ready", "client_waiting"):
        if not is_client:
            raise HTTPException(403, "Apenas o cliente pode enviar esta mensagem.")
        if not pro_user:
            raise HTTPException(404, "Profissional não encontrado.")
        event_key = "service.client_ready" if kind == "client_ready" else "service.client_waiting"
        try:
            fire_event(db, event_key, {
                **base_vars,
                "client_name": current.full_name or "Cliente",
            }, recipient_users={"professional": [pro_user]})
            db.commit()
        except Exception as e:
            print(f"[NOTIFY] {event_key} error: {e}")
        return {"ok": True, "message_type": kind}

    raise HTTPException(400, f"Tipo de mensagem desconhecido: '{kind}'")

@router.post("/{booking_id}/start-service-combined")
def start_service_combined(booking_id: str, body: CheckInRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Change 44a — one-shot "Iniciar atendimento".
    Does GPS check-in AND moves the booking from `accepted` straight to
    `checked_in` (skipping the intermediate `professional_arrived` state). Safe
    corner-case handling:
      - Pro-only: 403 otherwise.
      - Status gate: only works from `accepted`. Already-started / completed /
        cancelled → 400 with a clear message. If the pro somehow has the
        booking in `professional_arrived` (from the legacy 2-step flow), we
        accept and just flip to `checked_in` without re-GPS.
      - GPS proximity: validated against service_address snapshot first (Change 44),
        then patient fallback. Out-of-radius does NOT block — we flag it on the
        row for audit and return a warning in the response. Keeps parity with
        the existing /checkin behaviour (soft validation, not hard block)."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Only the assigned professional can start the service")

    status_now = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_now == "checked_in":
        # Idempotent — already running, don't error, just return current state
        return {"booking_id": booking_id, "status": "checked_in",
                "already_started": True,
                "message": "Serviço já está em andamento."}
    if status_now == "professional_arrived":
        # Legacy half-state: just promote to checked_in (keep existing GPS data)
        booking.status = BookingStatus.checked_in
        booking.service_started_at = datetime.now(timezone.utc)
        db.commit()
        return {"booking_id": booking_id, "status": "checked_in",
                "started_at": booking.service_started_at.isoformat(),
                "message": "Serviço iniciado."}
    if status_now != "accepted":
        raise HTTPException(400, f"Não é possível iniciar um atendimento com status '{status_now}'.")

    # Rule (23/11/2026) — block if the pro still has another open service.
    # 409 so the frontend can distinguish this from the generic 400s and
    # render the "Finalizar anterior e iniciar?" dialog. Must run BEFORE
    # the time gate so a pro with a stuck old service gets the useful
    # "finish previous" prompt rather than a confusing "too early" error.
    blocker = _find_blocking_booking(prof, booking, db)
    if blocker is not None:
        raise HTTPException(409, detail=_block_response_for(blocker, db))

    # Rule #3 — time gate. Server time is the source of truth. Must be within
    # [scheduled_start - 10 min, scheduled_start + 30 min]. Past +30 is only
    # allowed if the client has confirmed presence (sets
    # client_confirmed_pro_presence on the booking). Raises 400 otherwise.
    _check_start_time_gate(booking, db)

    # Store GPS, validate proximity. The helper hard-blocks (raises 400) on
    # extreme distances (>2 km), soft-flags on mid-range (500–2000 m), and
    # writes the audit fields on the row regardless. If target coords are
    # missing, we still store the pro's coords but can't validate — this
    # preserves prior behaviour for bookings created before Change 44.
    booking.checkin_lat = body.latitude
    booking.checkin_lng = body.longitude
    flagged, distance_m = _check_start_gps(booking, body.latitude, body.longitude, db)

    now_utc = datetime.now(timezone.utc)
    booking.actual_checkin = now_utc
    booking.service_started_at = now_utc
    booking.arrival_timer_start = now_utc
    booking.status = BookingStatus.checked_in

    # Late-arrival audit: if past T+15, mark the row and fire the event. If we
    # only got in because of a client-confirmed override past T+30, also flag
    # the booking for admin review so the ops team can inspect.
    was_late = _mark_late_arrival_if_applicable(booking, db, current)
    # Bug fix (25/11/2026) — scheduled_start is wall-clock Brazilian.
    sched = _sched_to_utc(booking.scheduled_start)
    client_override_used = (
        sched is not None
        and now_utc > sched + timedelta(minutes=MAX_START_LATE_MINUTES)
        and bool(getattr(booking, "client_confirmed_pro_presence", False))
    )
    if client_override_used:
        booking.review_type = "gps_exception"
        booking.gps_exception_reason = (
            booking.gps_exception_reason
            or "Atendimento iniciado após o prazo de 30 min — presença confirmada pelo cliente."
        )

    db.commit()

    # Notify client (service started)
    try:
        client_user = _get_booking_client_user(booking, db)
        if client_user:
            fire_event(db, "service.checked_in", {
                "professional_name": current.full_name or "Profissional",
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "start_time": now_utc.strftime("%H:%M"),
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] service.checked_in error: {e}")

    return {
        "booking_id": booking_id,
        "status": "checked_in",
        "started_at": now_utc.isoformat(),
        "flagged": flagged,
        "distance_m": round(distance_m) if distance_m is not None else None,
        "message": ("Serviço iniciado. Localização fora do raio esperado — verificar."
                    if flagged else "Serviço iniciado."),
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

    # Rule #3 — guard here too, so the legacy 2-step flow can't be used to
    # skip the time gate by splitting check-in and start-service.
    _check_start_time_gate(booking, db)

    booking.service_started_at = datetime.now(timezone.utc)
    booking.status = BookingStatus.checked_in
    db.commit()

    # ── Notify: service.checked_in → client ──
    try:
        client_user = _get_booking_client_user(booking, db)
        if client_user:
            fire_event(db, "service.checked_in", {
                "professional_name": current.full_name or "Profissional",
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "start_time": booking.service_started_at.strftime("%H:%M"),
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] service.checked_in error: {e}")

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

    # Rule (23/11/2026) — finish window gate: no manual checkout past
    # scheduled_end + 30 min. Pro must have requested an extension before
    # the service ended to legitimately stay longer; without one, the
    # scheduler auto-finishes the booking at scheduled_end and this gate
    # catches any tap that arrives before the sweep runs.
    _check_finish_time_gate(booking, db)

    booking.checkout_lat = body.latitude
    booking.checkout_lng = body.longitude
    booking.actual_checkout = datetime.now(timezone.utc)
    booking.status = BookingStatus.completed

    # #14: Calculate actual duration for audit
    if booking.actual_checkin:
        actual_minutes = (booking.actual_checkout - booking.actual_checkin).total_seconds() / 60
        booking.actual_duration_minutes = round(actual_minutes)

    # Change 23/30 — early-finalize pricing recalc.
    #
    # PAYMENT INVARIANTS (verified 23/11/2026):
    #   1. Early check-in (T-10min window) NEVER changes total_price. Check-in
    #      handlers only set actual_checkin and status; total_price was fixed
    #      at booking creation from scheduled_start..scheduled_end.
    #   2. Early finish ≤10 min → no recalc, full scheduled price (branch
    #      below only fires when minutes_early > EARLY_TOLERANCE_MIN=10).
    #   3. Early finish >10 min → recalc with sched_start..actual_checkout
    #      (NEVER using actual_checkin — the 10-min early check-in window
    #      must not inflate duration). Resulting discount is refunded.
    #   4. Past scheduled_end (actual_checkout > sched_end → minutes_early
    #      negative) → `minutes_early > 10` is False → no recalc. Staying
    #      longer than scheduled WITHOUT the Extension flow never raises
    #      the price automatically.
    #
    # Worked example: scheduled 10:00–14:00, check-in 09:52, check-out 13:55.
    #   minutes_early = 14:00 − 13:55 = 5. `5 > 10` is False → no recalc.
    #   Paid as exactly 4 h.
    #
    # actual_duration_minutes (audit only) is NEVER used for pricing — if it
    # ever is, the "early check-in inflates duration" invariant will break.
    early_termination_delta = 0.0
    try:
        # Item 8 (24/11/2026) — tolerance is admin-editable.
        from app.routes.settings import get_setting as _get_setting
        EARLY_TOLERANCE_MIN = int(_get_setting("early_termination_tolerance_min", db) or 10)
        sched_end = booking.scheduled_end
        if sched_end and booking.actual_checkout and booking.scheduled_start:
            # Normalise tz so arithmetic doesn't blow up on mixed types
            def _naive(d):
                return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
            sched_end_n = _naive(sched_end)
            actual_out_n = _naive(booking.actual_checkout)
            sched_start_n = _naive(booking.scheduled_start)
            minutes_early = (sched_end_n - actual_out_n).total_seconds() / 60
            if minutes_early > EARLY_TOLERANCE_MIN:
                # Role for pricing
                pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
                role = pro_user.role.value if (pro_user and hasattr(pro_user.role, "value")) else "caregiver"
                # Recalc with end = actual_checkout
                new_price = calculate_price(
                    role=role,
                    start_time=sched_start_n,
                    end_time=actual_out_n,
                    markup_pct=booking.markup_pct or 0,
                    is_urgent=bool(booking.is_urgent),
                    is_holiday=bool(booking.is_holiday),
                    distance_km=booking.distance_km or 0,
                )
                old_total = booking.total_price or 0
                new_total = new_price["total"]
                if new_total < old_total:
                    early_termination_delta = round(old_total - new_total, 2)
                    booking.total_price  = new_total
                    booking.platform_fee = new_price["platform_fee"]
                    booking.pro_payout   = new_price["pro_payout"]
                    booking.base_price   = new_price.get("base_price", booking.base_price)
                    booking.surcharge_pct = new_price.get("surcharge_pct", booking.surcharge_pct)
                    booking.early_termination = True
                    booking.early_termination_reason = (
                        f"Pro finalizou {int(minutes_early)} min antes do horário previsto. "
                        f"Diferença de R$ {early_termination_delta:.2f} a reembolsar."
                    )
                    # If a payment already exists, mark the refund amount for the client.
                    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
                    if payment:
                        prev = getattr(payment, "refund_amount", None) or 0
                        payment.refund_amount = round(float(prev) + early_termination_delta, 2)
    except Exception as early_err:
        print(f"[EARLY-FINISH] recalc failed: {early_err}")

    # Update professional stats
    prof.completed_count = (prof.completed_count or 0) + 1
    db.commit()

    # ── Notify: service.completed → client ──
    try:
        client_user = _get_booking_client_user(booking, db)
        if client_user:
            duration_str = f"{booking.actual_duration_minutes or 0} min"
            total_amount = f"{booking.total_price:.2f}" if booking.total_price else "0.00"
            fire_event(db, "service.completed", {
                "professional_name": current.full_name or "Profissional",
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "duration": duration_str,
                "total_amount": total_amount,
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[NOTIFY] service.completed error: {e}")

    return {
        "booking_id": booking_id, "status": "completed",
        "checkout_time": booking.actual_checkout.isoformat(),
        "actual_duration_minutes": booking.actual_duration_minutes,
        "early_termination": bool(early_termination_delta > 0),
        "refund_amount": early_termination_delta,
        "pro_payout": booking.pro_payout,
        "message": (
            f"Atendimento concluído. Valor ajustado — R$ {early_termination_delta:.2f} será reembolsado ao cliente."
            if early_termination_delta > 0
            else "Checkout realizado. Atendimento concluído."
        ),
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
    client = _get_booking_client_user(booking, db)
    if client:
        client.client_no_shows = (client.client_no_shows or 0) + 1
        client.reliability_score = max(0, (client.reliability_score or 100) - 10)

    db.commit()

    # ── Notify: service.no_show_client → professional + client ──
    try:
        client_user = _get_booking_client_user(booking, db)
        booking_code = f"#{booking.id[:6].upper()}"
        recipients = {}
        if client_user:
            recipients["client"] = [client_user]
        recipients["professional"] = [current]
        fire_event(db, "service.no_show_client", {
            "client_name": (client_user.full_name if client_user else "Cliente"),
            "service": booking.service_type or "Cuidado",
            "booking_code": booking_code,
            "booking_id": booking.id,
        }, recipient_users=recipients)
        db.commit()
    except Exception as e:
        print(f"[NOTIFY] service.no_show_client error: {e}")

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


# Item 10 (24/11/2026) — tiered response deadlines by booking advance.
def _pro_response_deadline(booking: "Booking", db: Session) -> "datetime":
    """Return the deadline by which the pro must respond to this booking
    request. Three tiers, all admin-editable:
      - urgent          → booking.is_urgent is True
      - same-day std    → scheduled_start within sameday_boundary_hours
      - advance         → beyond sameday_boundary_hours
    """
    from app.routes.settings import get_setting
    now = datetime.now(timezone.utc)
    if booking.is_urgent:
        return now + timedelta(minutes=int(get_setting("pro_response_urgent_min", db) or 30))
    # Bug fix (25/11/2026) — scheduled_start is wall-clock Brazilian.
    sched = _sched_to_utc(booking.scheduled_start)
    if sched is None:
        return now + timedelta(minutes=int(get_setting("pro_response_advance_min", db) or 180))
    hours_until = (sched - now).total_seconds() / 3600
    boundary = int(get_setting("pro_response_sameday_boundary_hours", db) or 24)
    if hours_until <= boundary:
        return now + timedelta(minutes=int(get_setting("pro_response_sameday_min", db) or 60))
    return now + timedelta(minutes=int(get_setting("pro_response_advance_min", db) or 180))
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
        # Rule #4 — skip pros with an existing commitment within the 30-min
        # travel buffer of this booking's window.
        if _has_scheduling_conflict(p.id, booking.scheduled_start, booking.scheduled_end, db, exclude_booking_id=booking_id) is not None:
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
    # Item 10 — tiered deadline from Admin Panel (replaces hardcoded).
    deadline = _pro_response_deadline(booking, db)

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
        # Rule #4 — 30-min travel buffer applies to rematch too.
        if _has_scheduling_conflict(p.id, booking.scheduled_start, booking.scheduled_end, db, exclude_booking_id=booking_id) is not None:
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

    # Item 10 — tiered deadline from Admin Panel (replaces hardcoded).
    deadline = _pro_response_deadline(booking, db)

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

    # Item 9 (24/11/2026) — all refund thresholds come from Admin Panel.
    from app.routes.settings import get_setting as _gs_refund
    grace_minutes = int(_gs_refund("grace_period_minutes", db) or GRACE_PERIOD_MINUTES)
    full_hours    = int(_gs_refund("refund_full_hours",    db) or 7)
    partial_hours = int(_gs_refund("refund_partial_hours", db) or 2)
    partial_pct   = int(_gs_refund("refund_partial_pct",   db) or 50)

    # Grace period: free cancellation within grace_minutes if pro hasn't
    # accepted and we're outside the full-refund window (otherwise the
    # standard 100% already applies and grace adds nothing).
    is_grace = (minutes_since_creation <= grace_minutes
                and booking.status.value == "pending"
                and hours_until > full_hours)

    if is_grace:
        refund_pct = 100
    elif hours_until > full_hours:
        refund_pct = 100
    elif hours_until >= partial_hours:
        refund_pct = partial_pct
    else:
        refund_pct = 0

    # Item 9/11 (24/11/2026) — Grace use limit + manual-review trigger.
    # All thresholds admin-editable:
    #   grace_max_uses_30d          — max uses before grace stops applying
    #   grace_manual_review_threshold — Nth use flags for manual admin review
    # (no automatic suspension; replaces the old "Revisão após N" behaviour).
    if is_grace:
        from datetime import timedelta as td
        from app.routes.settings import get_setting as _gs
        thirty_days_ago = now - td(days=30)
        _client_id = _get_booking_client_id(booking, db)
        grace_count = db.query(Booking).filter(
            Booking.user_id == _client_id,
            Booking.cancel_reason != None,
            Booking.cancel_reason.contains("grace"),
            Booking.cancelled_at > thirty_days_ago,
        ).count()
        max_uses = int(_gs("grace_max_uses_30d", db) or 3)
        review_at = int(_gs("grace_manual_review_threshold", db) or 4)
        # Flag for manual review when hitting the Nth use (no auto-suspend).
        if grace_count + 1 >= review_at:
            booking.review_type = booking.review_type or "grace_abuse"
        # Beyond the cap, grace stops applying; fall through to standard tiers.
        if grace_count >= max_uses:
            is_grace = False
            full_hours = int(_gs("refund_full_hours", db) or 7)
            partial_hours = int(_gs("refund_partial_hours", db) or 2)
            partial_pct = int(_gs("refund_partial_pct", db) or 50)
            if hours_until > full_hours:
                refund_pct = 100
            elif hours_until >= partial_hours:
                refund_pct = partial_pct
            else:
                refund_pct = 0

    # Update booking
    booking.status = BookingStatus.cancelled
    grace_tag = " (grace)" if is_grace else ""
    booking.cancel_reason = f"{body.reason}: {body.detail}{grace_tag}" if body.detail else f"{body.reason}{grace_tag}"
    booking.cancelled_by = body.cancelled_by
    booking.cancelled_at = now

    # Item 11 (24/11/2026) — Progressive professional penalties, every
    # threshold admin-editable. Steps:
    #   recent_cancels <  warning_count         → warning only (no score hit)
    #   recent_cancels >= warning_count AND
    #                   <  score_reduction_count → warning + score drop
    #   recent_cancels >= score_reduction_count → first suspension (N days)
    #   recent_cancels >= score_reduction_count*2 → repeat suspension (N days)
    if body.cancelled_by == "professional":
        prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        if prof:
            prof.late_cancellations = (prof.late_cancellations or 0) + 1
            from datetime import timedelta as td
            from app.routes.settings import get_setting as _gs
            warn_count    = int(_gs("pro_cancel_warning_count",         db) or 2)
            score_count   = int(_gs("pro_cancel_score_reduction_count", db) or 3)
            score_pts     = int(_gs("pro_cancel_score_reduction_pts",   db) or 10)
            first_days    = int(_gs("pro_cancel_suspend_days_first",    db) or 7)
            repeat_days   = int(_gs("pro_cancel_suspend_days_repeat",   db) or 30)
            window_days   = int(_gs("penalty_reset_days",               db) or 90)
            cutoff = now - td(days=window_days)
            recent_cancels = db.query(Booking).filter(
                Booking.professional_id == booking.professional_id,
                Booking.cancelled_by == "professional",
                Booking.cancelled_at > cutoff,
            ).count()

            if recent_cancels < warn_count:
                pass  # warning only, no score hit
            elif recent_cancels < score_count:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - score_pts)
            elif recent_cancels < score_count * 2:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - score_pts * 2)
                prof.suspended_until = now + td(days=first_days)
                prof.is_available = False
            else:
                prof.reliability_score = max(0, (prof.reliability_score or 100) - score_pts * 3)
                prof.suspended_until = now + td(days=repeat_days)
                prof.is_available = False

    # #4: Progressive client penalties
    else:
        client = _get_booking_client_user(booking, db)
        if client and not is_grace:
            client.reliability_score = max(0, (client.reliability_score or 100) - 3)
            # Check no-show count in 90 days
            from datetime import timedelta as td
            ninety_days_ago = now - td(days=90)
            _cid = _get_booking_client_id(booking, db)
            no_show_count = db.query(Booking).filter(
                Booking.user_id == _cid,
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

    # ── Notify: booking.cancelled_by_client or _by_professional ──
    try:
        _prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
        pro_user = db.query(User).filter(User.id == _prof.user_id).first() if _prof else None
        client_user = _get_booking_client_user(booking, db)
        booking_code = f"#{booking.id[:6].upper()}"
        cancel_vars = {
            "service": booking.service_type or "Cuidado",
            "booking_date": booking.scheduled_start.strftime("%d/%m"),
            "booking_code": booking_code,
            "booking_id": booking.id,
            "cancellation_reason": body.reason or "Não informado",
        }
        if body.cancelled_by == "client" and pro_user:
            cancel_vars["client_name"] = (client_user.full_name if client_user else "Cliente")
            fire_event(db, "booking.cancelled_by_client", cancel_vars,
                       recipient_users={"professional": [pro_user]})
        elif body.cancelled_by == "professional" and client_user:
            cancel_vars["professional_name"] = (pro_user.full_name if pro_user else "Profissional")
            fire_event(db, "booking.cancelled_by_professional", cancel_vars,
                       recipient_users={"client": [client_user]})
        db.commit()
    except Exception as e:
        print(f"[NOTIFY] booking.cancel(POST) error: {e}")

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
        # Rule #4 — the admin's replacement pro must also respect the 30-min
        # buffer; otherwise we'd hand a pro a booking that conflicts with
        # their existing schedule.
        if _has_scheduling_conflict(p.id, booking.scheduled_start, booking.scheduled_end, db, exclude_booking_id=booking_id) is not None:
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
    """Check if professional arrived late (past the tolerance).

    Item 11 (24/11/2026) — thresholds come from the Admin Panel:
      - late_arrival_after_min — tolerance after scheduled_start
      - late_arrival_internal_only_count — first N incidents hurt only
        the internal reliability_score
      - late_arrival_public_threshold — crossing this count also docks
        the public star rating (rating_avg).
    Window: 90 days (also admin-editable via penalty_reset_days).
    """
    from app.routes.settings import get_setting
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")

    if not booking.actual_checkin or not booking.scheduled_start:
        return {"late": False}

    tolerance = int(get_setting("late_arrival_after_min", db) or LATE_ARRIVAL_TOLERANCE_MINUTES)
    scheduled = booking.scheduled_start.replace(tzinfo=timezone.utc) if booking.scheduled_start.tzinfo is None else booking.scheduled_start
    actual = booking.actual_checkin.replace(tzinfo=timezone.utc) if booking.actual_checkin.tzinfo is None else booking.actual_checkin
    delay_minutes = (actual - scheduled).total_seconds() / 60

    if delay_minutes <= tolerance:
        return {"late": False, "delay_minutes": round(delay_minutes)}

    booking.late_arrival = True
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    penalty_level = "internal"
    if prof:
        window_days = int(get_setting("penalty_reset_days", db) or 90)
        internal_only_count = int(get_setting("late_arrival_internal_only_count", db) or 2)
        public_threshold    = int(get_setting("late_arrival_public_threshold",    db) or 3)
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
        late_count = db.query(Booking).filter(
            Booking.professional_id == booking.professional_id,
            Booking.late_arrival == True,
            Booking.actual_checkin > cutoff,
        ).count()

        if late_count <= internal_only_count:
            prof.reliability_score = max(0, (prof.reliability_score or 100) - 3)
            penalty_level = "internal"
        elif late_count >= public_threshold:
            prof.reliability_score = max(0, (prof.reliability_score or 100) - 5)
            if prof.rating_avg and prof.rating_avg > 0:
                prof.rating_avg = max(1.0, (prof.rating_avg or 5.0) - 0.1)
            penalty_level = "public"
        else:
            prof.reliability_score = max(0, (prof.reliability_score or 100) - 4)
            penalty_level = "internal"

    db.commit()
    return {"late": True, "delay_minutes": round(delay_minutes), "penalty_level": penalty_level}


# Item 11 (24/11/2026) — Client no-show threshold → require card pre-auth.
def _client_requires_card_preauth(client_user_id: str, db: Session) -> bool:
    """Return True when the client has had >= client_noshow_count_threshold
    no-shows within client_noshow_window_days. Used by the booking creation
    flow to force a pre-authorised card instead of a hold-less booking."""
    try:
        from app.routes.settings import get_setting
        threshold = int(get_setting("client_noshow_count_threshold", db) or 3)
        window_days = int(get_setting("client_noshow_window_days", db) or 90)
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
        count = db.query(Booking).filter(
            Booking.user_id == client_user_id,
            Booking.no_show_who == "client",
            Booking.cancelled_at.isnot(None),
            Booking.cancelled_at > cutoff,
        ).count()
        return count >= threshold
    except Exception:
        return False


@router.get("/client/requires-preauth")
def client_requires_preauth(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Public endpoint — the frontend's NewBooking flow calls this to decide
    whether to force the card pre-auth path. Admin-tunable thresholds."""
    return {
        "requires_preauth": _client_requires_card_preauth(current.id, db),
    }

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
        if _get_booking_client_id(booking, db) != current.id and (not prof or prof.user_id != current.id):
            raise HTTPException(403, "Access denied")

    payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()

    return {
        "booking_id": booking.id,
        "client_id": booking.user_id or _get_booking_client_id(booking, db),
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

# ── #9 + Rule #5 (23/11/2026): Client-initiated Service Extension ─────────────
#
# Flow:
#   1. Client opens an in-progress booking, taps "Estender atendimento".
#      Frontend first calls GET /extension-options which returns the allowed
#      30-min increments (bounded by the pro's next booking's travel buffer)
#      with each option's exact additional cost.
#   2. Client picks an option, POSTs /request-extension with additional_minutes.
#      Booking row is updated with extension_* fields, status="requested".
#      Pro is notified.
#   3. Pro accepts → PATCH /extension/confirm. Server attempts to charge
#      the client the additional amount (updating the existing Payment row);
#      on success scheduled_end is advanced and total_price updated. Payment
#      failure sets status=payment_failed and notifies both — the extension
#      does NOT take effect.
#   4. Pro declines → PATCH /extension/decline. Client notified.
#   5. If pro doesn't respond by scheduled_end, the scheduler sweep expires
#      the request (extension_status="expired").
#
# Pricing: hourly rate for the role, day/night-split via pricing engine's
# _count_day_night_minutes. NO Initial Service Fee is charged again.

EXTENSION_MIN_MINUTES   = 30
EXTENSION_STEP_MINUTES  = 30
EXTENSION_MAX_MINUTES   = 240  # 4 h — presented as 8 options; the real cap
                                # is often the next-booking travel buffer.


def _compute_extension_cost(booking: "Booking", current_end: "datetime", new_end: "datetime", db: Session) -> float:
    """Return the additional price for extending `booking` from current_end to
    new_end. Uses the pricing engine's day/night split; no Initial Fee."""
    from app.utils.pricing import _count_day_night_minutes, HOUR_RATES
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
    role = user.role.value if user and hasattr(user.role, "value") else "caregiver"
    rates = HOUR_RATES.get(role) or HOUR_RATES["caregiver"]
    split = _count_day_night_minutes(current_end, new_end)
    day_cost   = round(split["day"]   / 60 * rates["day"],   2)
    night_cost = round(split["night"] / 60 * rates["night"], 2)
    return round(day_cost + night_cost, 2)


def _next_booking_start_for_pro(pro_id, after_dt, db: Session, exclude_booking_id=None):
    """Return the earliest scheduled_start of the pro's NEXT active booking
    after `after_dt`, or None. Used to cap the extension length so the
    30-min travel buffer is preserved."""
    if not pro_id or after_dt is None:
        return None
    active = [
        BookingStatus.pending, BookingStatus.accepted,
        BookingStatus.professional_arrived, BookingStatus.checked_in,
    ]
    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    after_n = _n(after_dt)
    q = db.query(Booking).filter(
        Booking.professional_id == pro_id,
        Booking.status.in_(active),
        Booking.scheduled_start.isnot(None),
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)
    earliest = None
    for b in q.all():
        s = _n(b.scheduled_start)
        if s > after_n and (earliest is None or s < earliest):
            earliest = s
    return earliest


def _extension_max_minutes_for(booking: "Booking", db: Session) -> int:
    """How much more time the pro can take on this booking before bumping
    into their next commitment (minus the min_gap_between_bookings_min
    travel buffer). Capped at EXTENSION_MAX_MINUTES."""
    current_end = booking.scheduled_end
    if current_end is None:
        return 0
    next_start = _next_booking_start_for_pro(booking.professional_id, current_end, db, exclude_booking_id=booking.id)
    cfg = _time_cfg(db)
    if next_start is None:
        return EXTENSION_MAX_MINUTES
    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    gap = (next_start - _n(current_end)).total_seconds() / 60
    available = int(gap - cfg["min_gap"])
    return max(0, min(EXTENSION_MAX_MINUTES, available))


@router.get("/{booking_id}/extension-options")
def get_extension_options(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """List the extension options the CLIENT can pick for this booking.

    Each option is {minutes, additional_cost, new_end, available}. 30-min
    increments from 30 up to EXTENSION_MAX_MINUTES, capped by the pro's
    next booking (minus the travel buffer). Unavailable options are
    omitted so the frontend doesn't render them."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(booking, db) != current.id and current.role.value != "admin":
        raise HTTPException(403, "Apenas o cliente pode solicitar extensão.")
    status_now = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_now not in ("checked_in", "professional_arrived"):
        raise HTTPException(400, "Extensão só é possível durante o atendimento em andamento.")
    if booking.extension_status == "requested":
        raise HTTPException(400, "Já existe uma solicitação de extensão pendente para este atendimento.")

    current_end = booking.scheduled_end
    if current_end is None:
        raise HTTPException(400, "Atendimento sem horário de término definido.")
    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    end_n = _n(current_end)

    max_minutes = _extension_max_minutes_for(booking, db)
    cfg = _time_cfg(db)
    step = cfg["ext_step"]
    options = []
    for m in range(step, EXTENSION_MAX_MINUTES + 1, step):
        if m > max_minutes:
            break
        new_end = end_n + timedelta(minutes=m)
        cost = _compute_extension_cost(booking, end_n, new_end, db)
        options.append({
            "minutes": m,
            "additional_cost": cost,
            "new_end": new_end.isoformat(),
        })
    return {
        "booking_id": booking_id,
        "current_end": end_n.isoformat(),
        "min_minutes": step,
        "step_minutes": step,
        "max_minutes": max_minutes,
        "options": options,
    }


class ExtensionRequest(BaseModel):
    # Prefer `additional_minutes` for the Rule #5 flow (30-min increments).
    # `new_end_time` is kept for backward compatibility with the earlier
    # "pro-initiated or either side" flow — if provided, it overrides.
    additional_minutes: Optional[int] = None
    new_end_time:       Optional[datetime] = None
    requested_by:       Optional[str] = None  # "client" | "professional"; auto-detected if omitted


@router.post("/{booking_id}/request-extension")
def request_extension(booking_id: str, body: ExtensionRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Request to extend an in-progress booking. Rule #5 — client-initiated.

    Validates: min 30 min, multiple of 30 min, within the pro's travel-buffer
    window. Stores the request + computed cost; notifies the pro. Charging
    happens on /extension/confirm (pro accepts).
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    status_now = booking.status.value if hasattr(booking.status, "value") else str(booking.status)
    if status_now not in ("checked_in", "professional_arrived"):
        raise HTTPException(400, "Extensão só é possível durante o atendimento em andamento.")
    if booking.extension_status == "requested":
        raise HTTPException(400, "Já existe uma solicitação de extensão pendente para este atendimento.")

    # Auto-detect requester role from the auth'd user (the body field is now
    # optional and informational; the server decides authoritatively).
    client_id = _get_booking_client_id(booking, db)
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    requested_by = None
    if current.id == client_id:
        requested_by = "client"
    elif prof and prof.user_id == current.id:
        requested_by = "professional"
    else:
        raise HTTPException(403, "Apenas o cliente ou o profissional podem solicitar extensão.")

    # Resolve additional_minutes
    current_end = booking.scheduled_end
    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    end_n = _n(current_end)
    if body.additional_minutes is not None:
        add_min = int(body.additional_minutes)
    elif body.new_end_time is not None:
        add_min = int((_n(body.new_end_time) - end_n).total_seconds() / 60)
    else:
        raise HTTPException(400, "Informe additional_minutes (30, 60, 90…) ou new_end_time.")

    # Validate increment + minimum + max (step configured via Admin Panel)
    cfg = _time_cfg(db)
    step = cfg["ext_step"]
    if add_min < step:
        raise HTTPException(400, f"A extensão mínima é de {step} minutos.")
    if add_min % step != 0:
        raise HTTPException(400, f"A extensão deve ser em múltiplos de {step} minutos.")
    max_min = _extension_max_minutes_for(booking, db)
    if max_min <= 0:
        raise HTTPException(
            400,
            "Sem tempo disponível para extensão: o profissional tem outro atendimento logo após este."
        )
    if add_min > max_min:
        raise HTTPException(
            400,
            f"O profissional tem outro atendimento em sequência. A extensão máxima disponível é de {max_min} minutos."
        )

    new_end = end_n + timedelta(minutes=add_min)
    cost = _compute_extension_cost(booking, end_n, new_end, db)

    booking.extension_new_end        = new_end
    booking.extension_requested_by   = requested_by
    booking.extension_additional_cost = cost
    booking.extension_status         = "requested"
    db.commit()

    # Notify the OTHER party.
    try:
        pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
        client_user = _get_booking_client_user(booking, db)
        vars_ = {
            "service": booking.service_type or "Cuidado",
            "booking_code": f"#{booking.id[:6].upper()}",
            "booking_id": booking.id,
            "additional_minutes": str(add_min),
            "additional_cost": f"{cost:.2f}",
        }
        if requested_by == "client" and pro_user:
            fire_event(db, "service.extension_requested_pro", vars_, recipient_users={"professional": [pro_user]})
        elif requested_by == "professional" and client_user:
            # Legacy path — pro-initiated extension (kept so existing callers
            # don't break). Rule #5 is client-initiated, but we still notify
            # cleanly if the other code path is used.
            fire_event(db, "service.extension_requested_client", vars_, recipient_users={"client": [client_user]})
        db.commit()
    except Exception as e:
        print(f"[EXTENSION] notify failed for {booking.id}: {e}")

    return {
        "booking_id": booking_id,
        "extension_status": "requested",
        "additional_minutes": add_min,
        "additional_cost": cost,
        "new_end": new_end.isoformat(),
        "message": "Extensão solicitada. Aguardando resposta do profissional.",
    }


@router.patch("/{booking_id}/extension/confirm")
def confirm_extension(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Pro accepts the client's extension request. Charges the client the
    additional amount (updates the existing Payment row for this booking).
    On success scheduled_end is advanced and total_price updated. On payment
    failure, extension_status flips to "payment_failed", both sides are
    notified, and the original schedule stays in place.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.extension_status != "requested":
        raise HTTPException(400, "Nenhuma extensão pendente para este atendimento.")

    # Only the counterpart of the requester may confirm. For Rule #5
    # (client-initiated) the accepter is the professional. We keep the
    # legacy direction too for backward compatibility.
    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    client_id = _get_booking_client_id(booking, db)
    if booking.extension_requested_by == "client":
        if not prof or prof.user_id != current.id:
            raise HTTPException(403, "Apenas o profissional pode confirmar esta extensão.")
    else:  # "professional"
        if current.id != client_id:
            raise HTTPException(403, "Apenas o cliente pode confirmar esta extensão.")

    new_end = booking.extension_new_end
    add_cost = float(booking.extension_additional_cost or 0)

    # Re-check the travel buffer — a conflicting booking might have been
    # accepted by the pro while this request was waiting.
    if new_end is not None:
        max_min = _extension_max_minutes_for(booking, db)
        def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
        requested_min = int((_n(new_end) - _n(booking.scheduled_end)).total_seconds() / 60)
        if requested_min > max_min:
            booking.extension_status = "declined"
            db.commit()
            raise HTTPException(
                400,
                "A extensão não pode mais ser confirmada: há outro atendimento conflitante. "
                "Peça ao cliente para solicitar uma nova extensão com duração menor."
            )

    # Attempt to charge. In this codebase the Payment row is the system of
    # record for the booking's payment state; a real gateway charge is a
    # follow-up. We update the row's amount and append a note. If anything
    # here fails, we flip to payment_failed and leave the schedule alone.
    payment_ok = True
    try:
        from app.models.models import Payment, PaymentStatus
        payment = db.query(Payment).filter(Payment.booking_id == booking_id).first()
        if payment is None:
            # No payment yet — unusual for a checked_in booking but not fatal.
            # Just add it to the row total and let reconciliation sort it out.
            pass
        else:
            payment.amount = round(float(payment.amount or 0) + add_cost, 2)
            # Keep status as-is (held/authorized); the add is part of the
            # same authorization pattern. A real gateway hook would charge
            # here and raise on failure.
    except Exception as pay_err:
        payment_ok = False
        print(f"[EXTENSION] payment update failed for {booking_id}: {pay_err}")

    if not payment_ok:
        booking.extension_status = "payment_failed"
        db.commit()
        # Notify both sides that payment failed and original schedule stays.
        try:
            pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
            client_user = _get_booking_client_user(booking, db)
            vars_ = {
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "additional_cost": f"{add_cost:.2f}",
            }
            recipients = {}
            if client_user: recipients["client"] = [client_user]
            if pro_user:    recipients["professional"] = [pro_user]
            if recipients:
                fire_event(db, "service.extension_payment_failed", vars_, recipient_users=recipients)
            db.commit()
        except Exception as e:
            print(f"[EXTENSION] payment-fail notify error: {e}")
        return {
            "booking_id": booking_id,
            "extension_status": "payment_failed",
            "message": "O pagamento da extensão falhou. O horário original permanece.",
        }

    # Payment succeeded (or deferred cleanly) — apply the extension.
    booking.scheduled_end = new_end
    booking.extension_status = "confirmed"
    booking.total_price = round(float(booking.total_price or 0) + add_cost, 2)
    db.commit()

    # Notify the client.
    try:
        client_user = _get_booking_client_user(booking, db)
        if client_user:
            fire_event(db, "service.extension_confirmed", {
                "service": booking.service_type or "Cuidado",
                "booking_code": f"#{booking.id[:6].upper()}",
                "booking_id": booking.id,
                "new_end": booking.scheduled_end.strftime("%H:%M"),
                "additional_cost": f"{add_cost:.2f}",
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[EXTENSION] confirm notify error: {e}")

    return {
        "booking_id": booking_id,
        "extension_status": "confirmed",
        "new_end": booking.scheduled_end.isoformat(),
        "new_total": booking.total_price,
        "additional_cost": add_cost,
        "message": "Extensão confirmada. Horário e valor atualizados.",
    }


@router.patch("/{booking_id}/extension/decline")
def decline_extension(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Pro declines the client's extension (or vice versa). Notifies the
    other side; original schedule stays."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.extension_status != "requested":
        raise HTTPException(400, "Nenhuma extensão pendente para este atendimento.")

    prof = db.query(Professional).filter(Professional.id == booking.professional_id).first()
    client_id = _get_booking_client_id(booking, db)
    # The non-requester declines.
    if booking.extension_requested_by == "client":
        if not prof or prof.user_id != current.id:
            raise HTTPException(403, "Apenas o profissional pode recusar esta extensão.")
    else:
        if current.id != client_id:
            raise HTTPException(403, "Apenas o cliente pode recusar esta extensão.")

    booking.extension_status = "declined"
    db.commit()

    try:
        pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
        client_user = _get_booking_client_user(booking, db)
        vars_ = {
            "service": booking.service_type or "Cuidado",
            "booking_code": f"#{booking.id[:6].upper()}",
            "booking_id": booking.id,
        }
        if booking.extension_requested_by == "client" and client_user:
            fire_event(db, "service.extension_declined", vars_, recipient_users={"client": [client_user]})
        elif pro_user:
            fire_event(db, "service.extension_declined", vars_, recipient_users={"professional": [pro_user]})
        db.commit()
    except Exception as e:
        print(f"[EXTENSION] decline notify error: {e}")

    return {"booking_id": booking_id, "extension_status": "declined", "message": "Extensão recusada."}


# ── Item 6 (24/11/2026): Client-initiated duration change (before start) ─────
#
# Distinct from the Extension flow (which only covers in-progress bookings
# and only INCREASES). This flow runs while a booking is still `pending`
# or `accepted` (service not yet started) and allows both increase and
# decrease. Pro must confirm each change.
#
# Rules:
#  - Only the booking's client can request.
#  - Only when status in (pending, accepted). After start, use Extension
#    (increase) or Early Termination (decrease).
#  - Increase: respects travel gap to pro's next booking (same formula as
#    extension-options). Client pays the difference.
#  - Decrease: allowed only if (scheduled_start - now) > min_notice_reduce_hours.
#    New duration must stay >= min_booking_hours. Client is refunded the
#    removed hours.
#  - Each change is logged (duration_change_log).

@router.get("/{booking_id}/duration-change-options")
def duration_change_options(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """List the duration-change options for the client. Returns 30-min
    increments in both directions, bounded by travel gap (increase) and
    the admin-editable notice-to-reduce + min booking duration (decrease)."""
    from app.routes.settings import get_setting
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(b, db) != current.id and current.role.value != "admin":
        raise HTTPException(403, "Apenas o cliente pode alterar a duração.")
    status_val = b.status.value if hasattr(b.status, "value") else str(b.status)
    if status_val not in ("pending", "accepted"):
        raise HTTPException(400, "A duração só pode ser alterada antes do atendimento começar.")
    if b.duration_change_status == "requested":
        raise HTTPException(400, "Já existe uma alteração de duração pendente.")

    cfg = _time_cfg(db)
    step = cfg["ext_step"]  # share step with extension for consistency

    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    start_n = _n(b.scheduled_start) if b.scheduled_start else None
    end_n   = _n(b.scheduled_end)   if b.scheduled_end   else None
    now_n   = _n(datetime.now(timezone.utc))
    if start_n is None or end_n is None:
        raise HTTPException(400, "Atendimento sem horários definidos.")

    # ── Increase options (respects travel gap) ─────────────────────────────
    max_increase = _extension_max_minutes_for(b, db)
    increase_options = []
    for m in range(step, EXTENSION_MAX_MINUTES + 1, step):
        if m > max_increase: break
        new_end = end_n + timedelta(minutes=m)
        delta = _compute_extension_cost(b, end_n, new_end, db)
        increase_options.append({
            "direction": "increase",
            "minutes":   m,
            "new_end":   new_end.isoformat(),
            "delta":     delta,
        })

    # ── Decrease options ───────────────────────────────────────────────────
    decrease_options = []
    min_notice_h = int(get_setting("min_notice_reduce_hours", db) or 2)
    hours_until_start = (start_n - now_n).total_seconds() / 3600
    min_booking_h = int(get_setting("min_booking_hours", db) or 2)
    min_duration_min = min_booking_h * 60
    cur_duration_min = int((end_n - start_n).total_seconds() / 60)
    decrease_allowed = hours_until_start > min_notice_h
    if decrease_allowed:
        for m in range(step, EXTENSION_MAX_MINUTES + 1, step):
            new_dur = cur_duration_min - m
            if new_dur < min_duration_min:
                break
            new_end = end_n - timedelta(minutes=m)
            # Refund = the removed portion priced with the same engine.
            # Delta is NEGATIVE to signal refund.
            refund = _compute_extension_cost(b, new_end, end_n, db)
            decrease_options.append({
                "direction": "decrease",
                "minutes":   m,
                "new_end":   new_end.isoformat(),
                "delta":     -refund,
            })

    return {
        "booking_id":         booking_id,
        "current_end":        end_n.isoformat(),
        "current_duration_minutes": cur_duration_min,
        "step_minutes":       step,
        "increase_options":   increase_options,
        "decrease_options":   decrease_options,
        "decrease_allowed":   decrease_allowed,
        "decrease_locked_reason": None if decrease_allowed else (
            f"Não é possível reduzir o atendimento com menos de {min_notice_h}h de antecedência."
        ),
        "min_booking_hours":  min_booking_h,
        "min_notice_hours":   min_notice_h,
    }


class DurationChangeRequest(BaseModel):
    direction: str                        # "increase" | "decrease"
    minutes:   int                        # positive magnitude, multiple of step


@router.post("/{booking_id}/duration-change-request")
def duration_change_request(booking_id: str, body: DurationChangeRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Client requests a duration change. Validates, stores, notifies pro."""
    from app.routes.settings import get_setting
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    if _get_booking_client_id(b, db) != current.id:
        raise HTTPException(403, "Apenas o cliente pode alterar a duração.")
    status_val = b.status.value if hasattr(b.status, "value") else str(b.status)
    if status_val not in ("pending", "accepted"):
        raise HTTPException(400, "A duração só pode ser alterada antes do atendimento começar.")
    if b.duration_change_status == "requested":
        raise HTTPException(400, "Já existe uma alteração de duração pendente.")
    if body.direction not in ("increase", "decrease"):
        raise HTTPException(400, "direction deve ser 'increase' ou 'decrease'.")

    cfg = _time_cfg(db)
    step = cfg["ext_step"]
    if body.minutes <= 0 or body.minutes % step != 0:
        raise HTTPException(400, f"A alteração deve ser em múltiplos de {step} minutos.")

    def _n(d): return d.replace(tzinfo=None) if getattr(d, "tzinfo", None) else d
    start_n = _n(b.scheduled_start)
    end_n   = _n(b.scheduled_end)
    now_n   = _n(datetime.now(timezone.utc))

    if body.direction == "increase":
        max_add = _extension_max_minutes_for(b, db)
        if body.minutes > max_add:
            raise HTTPException(
                400,
                f"O profissional tem outro atendimento em sequência. O aumento máximo disponível é de {max_add} minutos."
            )
        new_end = end_n + timedelta(minutes=body.minutes)
        delta = _compute_extension_cost(b, end_n, new_end, db)
    else:  # decrease
        min_notice_h = int(get_setting("min_notice_reduce_hours", db) or 2)
        if (start_n - now_n).total_seconds() / 3600 <= min_notice_h:
            raise HTTPException(
                400,
                f"Não é possível reduzir o atendimento com menos de {min_notice_h}h de antecedência."
            )
        min_booking_h = int(get_setting("min_booking_hours", db) or 2)
        cur_min = int((end_n - start_n).total_seconds() / 60)
        if cur_min - body.minutes < min_booking_h * 60:
            raise HTTPException(
                400,
                f"A nova duração não pode ser menor que o mínimo de {min_booking_h}h."
            )
        new_end = end_n - timedelta(minutes=body.minutes)
        delta = -_compute_extension_cost(b, new_end, end_n, db)

    b.duration_change_status       = "requested"
    b.duration_change_new_end      = new_end
    b.duration_change_delta        = delta
    b.duration_change_direction    = body.direction
    b.duration_change_requested_at = datetime.now(timezone.utc)
    # Append to log
    log = list(b.duration_change_log or [])
    log.append({
        "action":     "requested",
        "by":         "client",
        "by_user_id": current.id,
        "at":         b.duration_change_requested_at.isoformat(),
        "direction":  body.direction,
        "minutes":    body.minutes,
        "old_end":    end_n.isoformat(),
        "new_end":    new_end.isoformat(),
        "delta":      delta,
    })
    b.duration_change_log = log
    db.commit()

    try:
        prof = db.query(Professional).filter(Professional.id == b.professional_id).first() if b.professional_id else None
        pro_user = db.query(User).filter(User.id == prof.user_id).first() if prof else None
        if pro_user:
            fire_event(db, "service.duration_change_requested", {
                "service": b.service_type or "Cuidado",
                "booking_code": f"#{b.id[:6].upper()}",
                "booking_id": b.id,
                "direction": body.direction,
                "minutes": str(body.minutes),
                "delta": f"{delta:+.2f}",
            }, recipient_users={"professional": [pro_user]})
            db.commit()
    except Exception as e:
        print(f"[DURATION-CHANGE] notify failed for {b.id}: {e}")

    return {
        "booking_id": booking_id,
        "duration_change_status": "requested",
        "direction": body.direction,
        "minutes": body.minutes,
        "delta": delta,
        "new_end": new_end.isoformat(),
    }


@router.patch("/{booking_id}/duration-change/confirm")
def duration_change_confirm(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Pro accepts the client's duration change. Applies new end + total_price;
    on decrease, marks refund_amount on the Payment row. Rejects if a new
    conflicting booking landed in the pro's schedule in the meantime."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    if b.duration_change_status != "requested":
        raise HTTPException(400, "Nenhuma alteração pendente.")
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Apenas o profissional pode confirmar a alteração.")

    # Re-check travel-gap for increase (a conflicting booking might have been
    # accepted by the pro between request and confirmation).
    if b.duration_change_direction == "increase" and b.duration_change_new_end is not None:
        conflict = _has_scheduling_conflict(
            b.professional_id, b.scheduled_start, b.duration_change_new_end, db,
            exclude_booking_id=b.id,
        )
        if conflict is not None:
            b.duration_change_status = "declined"
            db.commit()
            raise HTTPException(400, "Conflito com outro atendimento. Peça ao cliente para enviar uma nova alteração.")

    old_end = b.scheduled_end
    b.scheduled_end = b.duration_change_new_end
    delta = float(b.duration_change_delta or 0)
    b.total_price = round(float(b.total_price or 0) + delta, 2)
    # Update Payment row amount and, on decrease, refund_amount.
    try:
        from app.models.models import Payment, PaymentStatus
        pay = db.query(Payment).filter(Payment.booking_id == booking_id).first()
        if pay:
            pay.amount = round(float(pay.amount or 0) + delta, 2)
            if delta < 0:
                prev = float(getattr(pay, "refund_amount", 0) or 0)
                pay.refund_amount = round(prev + abs(delta), 2)
    except Exception as e:
        print(f"[DURATION-CHANGE] payment update failed for {booking_id}: {e}")

    b.duration_change_status = "confirmed"
    log = list(b.duration_change_log or [])
    log.append({
        "action": "confirmed", "by": "professional", "by_user_id": current.id,
        "at": datetime.now(timezone.utc).isoformat(),
        "applied_new_end": b.scheduled_end.isoformat() if b.scheduled_end else None,
        "applied_delta":   delta,
    })
    b.duration_change_log = log
    db.commit()

    try:
        client_user = _get_booking_client_user(b, db)
        if client_user:
            fire_event(db, "service.duration_change_confirmed", {
                "service": b.service_type or "Cuidado",
                "booking_code": f"#{b.id[:6].upper()}",
                "booking_id": b.id,
                "new_end": b.scheduled_end.strftime("%H:%M"),
                "delta": f"{delta:+.2f}",
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[DURATION-CHANGE] confirm notify failed: {e}")

    return {
        "booking_id": booking_id,
        "duration_change_status": "confirmed",
        "new_end": b.scheduled_end.isoformat() if b.scheduled_end else None,
        "new_total": b.total_price,
        "delta": delta,
    }


@router.patch("/{booking_id}/duration-change/decline")
def duration_change_decline(booking_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Pro declines. Booking stays as it was; log the decline; notify client."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b: raise HTTPException(404, "Booking not found")
    if b.duration_change_status != "requested":
        raise HTTPException(400, "Nenhuma alteração pendente.")
    prof = db.query(Professional).filter(Professional.id == b.professional_id).first()
    if not prof or prof.user_id != current.id:
        raise HTTPException(403, "Apenas o profissional pode recusar a alteração.")
    b.duration_change_status = "declined"
    log = list(b.duration_change_log or [])
    log.append({
        "action": "declined", "by": "professional", "by_user_id": current.id,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    b.duration_change_log = log
    db.commit()
    try:
        client_user = _get_booking_client_user(b, db)
        if client_user:
            fire_event(db, "service.duration_change_declined", {
                "service": b.service_type or "Cuidado",
                "booking_code": f"#{b.id[:6].upper()}",
                "booking_id": b.id,
            }, recipient_users={"client": [client_user]})
            db.commit()
    except Exception as e:
        print(f"[DURATION-CHANGE] decline notify failed: {e}")
    return {"booking_id": booking_id, "duration_change_status": "declined"}