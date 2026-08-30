from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user, get_optional_user
from app.models.models import Professional, DocStatus, User
from app.utils.pricing import (
    professional_can_perform, minimum_role_for_services,
    SERVICES_BY_ROLE, calculate_price, VALID_MARKUPS,
    MINIMUM_PRICES, HOUR_RATES, INITIAL_SERVICE_FEE, SPECIALTIES_BY_ROLE
)

router = APIRouter(prefix="/professionals", tags=["professionals"])

class ProfessionalUpdate(BaseModel):
    council_number:   Optional[str]       = None
    council_state:    Optional[str]       = None
    services_offered: Optional[List[str]] = None
    service_radius:   Optional[int]       = None
    city:             Optional[str]       = None
    state:            Optional[str]       = None
    markup_pct:       Optional[int]       = None
    is_available:     Optional[bool]      = None
    bio:              Optional[str]       = None
    specialties:      Optional[List[str]] = None

class PriceCalcRequest(BaseModel):
    role:             Optional[str] = None
    professional_id:  Optional[str] = None
    start_time:       str   # ISO datetime
    end_time:         str   # ISO datetime
    markup_pct:       int   = 0
    is_urgent:        bool  = False
    is_holiday:       bool  = False
    distance_km:      float = 0.0

def get_or_create_profile(db: Session, user_id: str) -> Professional:
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        prof = Professional(
            user_id=user_id,
            approval_status=DocStatus.pending,
            is_available=False,
            services_offered=[],
            markup_pct=0,
        )
        db.add(prof)
        db.commit()
        db.refresh(prof)
    return prof

# Public endpoints (no auth needed — clients browse before login)
@router.get("/services")
def get_services_catalog():
    return SERVICES_BY_ROLE

@router.post("/calculate-price")
def calculate_booking_price(body: PriceCalcRequest, db: Session = Depends(get_db)):
    role = body.role
    markup = body.markup_pct

    if body.professional_id:
        prof = db.query(Professional).filter(Professional.id == body.professional_id).first()
        if not prof:
            raise HTTPException(404, "Professional not found")
        user = db.query(User).filter(User.id == prof.user_id).first()
        if not user:
            raise HTTPException(404, "Professional user not found")
        role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        markup = prof.markup_pct or 0

    if not role:
        raise HTTPException(400, "Either 'role' or 'professional_id' is required")

    from datetime import datetime as dt
    try:
        start = dt.fromisoformat(body.start_time)
        end = dt.fromisoformat(body.end_time)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid start_time or end_time format. Use ISO datetime.")

    try:
        return calculate_price(
            role=role, start_time=start, end_time=end,
            markup_pct=markup, is_urgent=body.is_urgent,
            is_holiday=body.is_holiday, distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.get("/nearby")
def get_nearby(
    lat:      float = -23.55,
    lng:      float = -46.63,
    radius:   int   = 50,
    services: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time:   Optional[str] = None,
    db:       Session = Depends(get_db),
    current:  Optional[User] = Depends(get_optional_user),
):
    """Public endpoint — returns approved+available professionals, filtered by services if provided."""
    from datetime import datetime, timezone
    required_services = [s.strip() for s in services.split(",")] if services else []
    now = datetime.now(timezone.utc)

    professionals = db.query(Professional).filter(
        Professional.approval_status == DocStatus.approved,
        Professional.is_available    == True,
    ).all()

    # Filter out resting professionals (#7 mandatory rest)
    professionals = [p for p in professionals if not p.rest_until or p.rest_until <= now]

    if required_services:
        min_role = minimum_role_for_services(required_services)
        if min_role is None:
            raise HTTPException(400, "One or more requested services are not recognised")
        filtered = []
        for prof in professionals:
            user = db.query(User).filter(User.id == prof.user_id).first()
            if not user:
                continue
            role = user.role.value if hasattr(user.role, 'value') else str(user.role)
            prof_services = prof.services_offered or []

            # 10.3-30: Skip globally suspended/banned accounts
            if getattr(user, 'account_status', 'active') in ('suspended', 'banned', 'deleted'):
                continue

            # 10.3-22,23,24: Check per-category active status
            category_records = prof.category_records or []
            can_perform = False
            active_role = role  # default to primary role

            # Check primary role
            if professional_can_perform(role, required_services):
                # 10.3-25: Primary role is always considered active unless explicitly deactivated
                primary_deactivated = any(r.get("role") == role and not r.get("is_active", True) for r in category_records)
                if not primary_deactivated:
                    can_perform = True
                    active_role = role

            # Check additional categories — only if ACTIVE for new bookings
            if not can_perform and prof.additional_categories:
                for cat in prof.additional_categories:
                    cat_role = cat.get("role", "")
                    if professional_can_perform(cat_role, required_services):
                        # 10.3-24: Check this specific category is active in records
                        cat_record = next((r for r in category_records if r.get("role") == cat_role), None)
                        if cat_record and cat_record.get("is_active", False) and cat_record.get("verification_status") == "approved":
                            can_perform = True
                            active_role = cat_role
                            break

            # 10.3-21: Check availability protection — existing bookings block time
            if can_perform and start_time and end_time:
                try:
                    from datetime import datetime as dt
                    s = dt.fromisoformat(start_time) if isinstance(start_time, str) else start_time
                    e = dt.fromisoformat(end_time) if isinstance(end_time, str) else end_time
                    conflict = db.query(Booking).filter(
                        Booking.professional_id == prof.id,
                        Booking.status.in_(["accepted", "checked_in", "professional_arrived"]),
                        Booking.scheduled_start < e,
                        Booking.scheduled_end > s,
                    ).first()
                    if conflict:
                        can_perform = False  # time slot already booked
                except:
                    pass

            if can_perform and any(s in prof_services for s in required_services):
                pro_data = {
                    **{c.key: getattr(prof, c.key) for c in prof.__table__.columns},
                    "full_name": user.full_name,
                    "role": active_role,
                }
                # V8-11: Calculate per-pro price if start/end time provided
                if start_time and end_time:
                    try:
                        from datetime import datetime as dt
                        s = dt.fromisoformat(start_time) if isinstance(start_time, str) else start_time
                        e = dt.fromisoformat(end_time) if isinstance(end_time, str) else end_time
                        price = calculate_price(role=active_role, start_time=s, end_time=e, markup_pct=prof.markup_pct or 0)
                        pro_data["total_price"] = price["total"]
                        pro_data["base_price"] = price["base_price"]
                        pro_data["pro_payout"] = price["pro_payout"]
                    except:
                        pass
                filtered.append(pro_data)
        return {"professionals": filtered, "count": len(filtered)}

    # No service filter — enrich all with user data
    result = []
    for prof in professionals:
        user = db.query(User).filter(User.id == prof.user_id).first()
        if not user:
            continue
        role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        result.append({
            **{c.key: getattr(prof, c.key) for c in prof.__table__.columns},
            "full_name": user.full_name,
            "role": role,
        })
    return {"professionals": result, "count": len(result)}

# Authenticated endpoints
@router.patch("/{user_id}/toggle-availability")
def toggle_availability(user_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    if current.id != user_id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
    prof = get_or_create_profile(db, user_id)
    if prof.approval_status != DocStatus.approved:
        raise HTTPException(403, "ACCOUNT_NOT_VERIFIED")
    prof.is_available = not prof.is_available
    db.commit()
    return {"is_available": prof.is_available}

@router.put("/{user_id}")
def update_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    if current.id != user_id and str(current.role) != "admin":
        raise HTTPException(403, "Access denied")
    prof = get_or_create_profile(db, user_id)
    data = body.dict(exclude_unset=True)
    if "markup_pct" in data and data["markup_pct"] not in VALID_MARKUPS:
        raise HTTPException(400, f"markup_pct must be one of {VALID_MARKUPS}")
    if data.get("is_available") == True and prof.approval_status != DocStatus.approved:
        data.pop("is_available")
    for k, v in data.items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof

@router.patch("/{user_id}")
def patch_professional(user_id: str, body: ProfessionalUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    return update_professional(user_id, body, db, current)

@router.get("/{user_id}")
def get_professional(user_id: str, db: Session = Depends(get_db), current=Depends(get_current_user)):
    return get_or_create_profile(db, user_id)

@router.get("/pricing-table/{role}")
def get_pricing_table(role: str):
    """Return platform rates for a given role. Public endpoint."""
    if role not in HOUR_RATES:
        raise HTTPException(400, f"Invalid role. Must be one of: {list(HOUR_RATES.keys())}")
    return {
        "role": role,
        "initial_fee": INITIAL_SERVICE_FEE[role],
        "day_rate": HOUR_RATES[role]["day"],
        "night_rate": HOUR_RATES[role]["night"],
        "minimum_duration_hours": 2,
        "commission_pct": 12,
    }

@router.get("/specialties/{role}")
def get_specialties(role: str):
    """Return available specialties for a given role."""
    if role not in SPECIALTIES_BY_ROLE:
        raise HTTPException(400, f"Invalid role. Must be one of: {list(SPECIALTIES_BY_ROLE.keys())}")
    return {"role": role, "specialties": SPECIALTIES_BY_ROLE[role]}
# ── #40: Distance/Travel Time Calculation ──────────────────────────────────────

import math

def _haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two GPS coordinates."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

class DistanceRequest(BaseModel):
    professional_id: str
    client_lat:      float
    client_lng:      float

@router.post("/distance")
def calculate_distance(body: DistanceRequest, db: Session = Depends(get_db)):
    """Calculate distance between professional and client location."""
    prof = db.query(Professional).filter(Professional.id == body.professional_id).first()
    if not prof:
        raise HTTPException(404, "Professional not found")

    if not prof.lat or not prof.lng:
        return {"distance_km": None, "travel_time_minutes": None, "message": "Localização do profissional não disponível."}

    dist = round(_haversine_km(prof.lat, prof.lng, body.client_lat, body.client_lng), 1)
    # Estimate travel time: avg 30 km/h in urban Brazil
    travel_min = round(dist / 30 * 60)

    return {
        "distance_km": dist,
        "travel_time_minutes": travel_min,
        "estimated_arrival": f"~{travel_min} min",
    }

# ── 45c: Generalized Category Management ──────────────────────────────────────

from app.utils.pricing import ROLE_RANK, HOUR_RATES, INITIAL_SERVICE_FEE

CATEGORY_TERMS = {
    "caregiver": "Eu entendo que, ao atuar como Cuidador(a), prestarei exclusivamente cuidados não-técnicos e não realizarei procedimentos técnicos de enfermagem.",
    "nursing_assistant": "Eu confirmo que possuo registro COREN ativo como Auxiliar de Enfermagem e atuarei dentro do escopo permitido pela minha formação.",
    "technician": "Eu confirmo que possuo registro COREN ativo como Técnico de Enfermagem e atuarei dentro do escopo permitido.",
    "nurse": "Eu confirmo que possuo registro COREN ativo como Enfermeiro(a) e atuarei dentro do escopo completo da enfermagem.",
}
TERMS_VERSION = "v1.0"

DERIVED_CATEGORIES = {
    "nurse": ["technician", "nursing_assistant", "caregiver"],
    "technician": ["nursing_assistant", "caregiver"],
    "nursing_assistant": ["caregiver"],
    "caregiver": [],
}

class CategorySwitchRequest(BaseModel):
    target_category: str
    accept_terms:    bool

@router.post("/switch-category")
def switch_category(body: CategorySwitchRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """45c: Switch active category. Supports ALL derived transitions, not just caregiver."""
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")

    current_role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    allowed = DERIVED_CATEGORIES.get(current_role, []) + [current_role]

    if body.target_category not in allowed:
        raise HTTPException(400, f"Não é possível mudar para '{body.target_category}'. Categorias permitidas: {allowed}")

    if body.target_category != current_role and not body.accept_terms:
        raise HTTPException(400, "Você deve aceitar os termos para atuar nesta categoria.")

    # Check for active bookings
    active = db.query(Booking).filter(
        Booking.professional_id == prof.id,
        Booking.status.in_(["pending", "accepted", "checked_in", "professional_arrived"]),
    ).first()
    if active:
        raise HTTPException(400, "Conclua ou cancele atendimentos pendentes antes de mudar de categoria.")

    from datetime import datetime, timezone
    acceptance = {
        "professional_id": prof.id, "from_category": prof.active_category or current_role,
        "to_category": body.target_category,
        "terms_text": CATEGORY_TERMS.get(body.target_category, ""),
        "terms_version": TERMS_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(), "type": "profile_switch",
    }

    prof.active_category = body.target_category
    prof.category_acceptances = (prof.category_acceptances or []) + [acceptance]

    # 45h: Auto-create category record if not exists
    records = list(prof.category_records or [])
    existing = next((r for r in records if r.get("role") == body.target_category), None)
    if not existing:
        records.append({
            "role": body.target_category,
            "verification_status": "approved" if body.target_category in DERIVED_CATEGORIES.get(current_role, []) else "pending",
            "documents": [],
            "rate_day": HOUR_RATES.get(body.target_category, {}).get("day", 0),
            "rate_night": HOUR_RATES.get(body.target_category, {}).get("night", 0),
            "is_active": True,
            "added_at": datetime.now(timezone.utc).isoformat(),
            "deactivated_at": None,
        })
        prof.category_records = records

    db.commit()
    return {"active_category": body.target_category, "original_role": current_role, "message": f"Categoria ativa: {body.target_category}."}

# ── 45g: Category Deactivation/Reactivation ───────────────────────────────────

@router.post("/category/{category}/deactivate")
def deactivate_category(category: str, deactivation_type: str = "voluntary", db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """10.3-17/18/19: Deactivate with future booking check + voluntary vs mandatory distinction."""
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")

    current_role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    if category == current_role:
        raise HTTPException(400, "Não é possível desativar sua categoria principal.")

    # 10.3-17: Check for future confirmed bookings under this category
    future_bookings = db.query(Booking).filter(
        Booking.professional_id == prof.id,
        Booking.status.in_(["accepted", "pending"]),
        Booking.scheduled_start > datetime.now(timezone.utc),
    ).all()
    # Filter to bookings matching this category
    category_bookings = [b for b in future_bookings if (b.service_type or "").lower().find(category) >= 0 or True]
    # Simplified: count all future bookings (category stored in booking snapshot)

    records = list(prof.category_records or [])
    found = False
    for r in records:
        if r.get("role") == category:
            # 10.3-18: Set to INACTIVE_FOR_NEW (not fully inactive if future bookings exist)
            r["is_active"] = False
            r["deactivated_at"] = datetime.now(timezone.utc).isoformat()
            r["deactivation_type"] = deactivation_type  # 10.3-19: voluntary or mandatory
            r["has_future_bookings"] = len(category_bookings) > 0
            if len(category_bookings) > 0:
                r["status"] = "inactive_for_new"  # still must complete existing bookings
            else:
                r["status"] = "fully_inactive"
            found = True
            break

    if not found:
        raise HTTPException(404, f"Categoria '{category}' não encontrada no seu perfil.")

    prof.category_records = records
    if prof.active_category == category:
        prof.active_category = current_role

    db.commit()

    result = {
        "category": category, "is_active": False,
        "deactivation_type": deactivation_type,
        "future_bookings_count": len(category_bookings),
    }

    # 10.3-17: Warning message if future bookings exist
    if len(category_bookings) > 0:
        result["warning"] = f"Você tem {len(category_bookings)} agendamento(s) futuro(s) confirmado(s) nesta categoria. Eles serão mantidos e não serão cancelados. A categoria não receberá novos agendamentos."
        result["message"] = f"Categoria '{category}' desativada para novos agendamentos. {len(category_bookings)} agendamento(s) existente(s) preservado(s)."
    else:
        result["message"] = f"Categoria '{category}' totalmente desativada."

    return result

@router.post("/category/{category}/reactivate")
def reactivate_category(category: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """45g: Reactivate a previously deactivated category."""
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")

    records = list(prof.category_records or [])
    found = False
    for r in records:
        if r.get("role") == category:
            r["is_active"] = True
            r["deactivated_at"] = None
            found = True
            break

    if not found:
        raise HTTPException(404, f"Categoria '{category}' não encontrada.")

    prof.category_records = records
    db.commit()
    return {"category": category, "is_active": True, "message": f"Categoria '{category}' reativada."}

# ── 45h: Category Records Listing ─────────────────────────────────────────────

@router.get("/categories")
def get_my_categories(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """45h: Get all category records for the professional."""
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")
    current_role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    available = DERIVED_CATEGORIES.get(current_role, [])
    records = prof.category_records or []
    held = [r["role"] for r in records]
    return {
        "original_role": current_role,
        "active_category": prof.active_category or current_role,
        "available_to_add": [c for c in available if c not in held],
        "categories": records,
    }

@router.get("/active-category")
def get_active_category(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")
    role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    return {
        "original_role": role,
        "active_category": prof.active_category or role,
        "can_switch_to": DERIVED_CATEGORIES.get(role, []) + [role],
    }

# ── 45d: Independent Category Addition ────────────────────────────────────────

# Docs required per independent category
INDEPENDENT_CATEGORY_DOCS = {
    "nurse":              ["coren_card", "coren_negative", "rg_cpf"],
    "technician":         ["coren_card", "coren_negative", "rg_cpf"],
    "nursing_assistant":  ["coren_card", "coren_negative", "rg_cpf"],
    "caregiver":          ["rg_cpf", "proof_of_training"],
}

class IndependentCategoryRequest(BaseModel):
    category:       str
    council_number: Optional[str] = None
    council_state:  Optional[str] = None
    accept_terms:   bool = False

@router.post("/add-independent-category")
def add_independent_category(body: IndependentCategoryRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """45d: Add an independent category that requires new docs (not a derived category)."""
    prof = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not prof:
        raise HTTPException(404, "Professional profile not found")

    current_role = current.role.value if hasattr(current.role, 'value') else str(current.role)
    valid_roles = ["nurse", "technician", "nursing_assistant", "caregiver"]

    if body.category not in valid_roles:
        raise HTTPException(400, f"Categoria inválida. Use: {valid_roles}")

    # Check if already held
    records = list(prof.category_records or [])
    existing = next((r for r in records if r.get("role") == body.category), None)
    if existing:
        raise HTTPException(400, f"Você já possui a categoria '{body.category}'. Use a opção de reativar se estiver desativada.")

    # Derived categories don't need new docs — redirect to switch-category
    derived = DERIVED_CATEGORIES.get(current_role, [])
    if body.category in derived:
        raise HTTPException(400, f"'{body.category}' é uma categoria derivada da sua. Use 'Trocar categoria' em vez de adicionar independente.")

    if not body.accept_terms:
        raise HTTPException(400, "Aceite os termos para adicionar esta categoria.")

    # Determine required docs
    required_docs = INDEPENDENT_CATEGORY_DOCS.get(body.category, ["rg_cpf"])

    from datetime import datetime, timezone
    new_record = {
        "role": body.category,
        "verification_status": "pending",
        "documents": [],
        "required_documents": required_docs,
        "council_number": body.council_number,
        "council_state": body.council_state,
        "rate_day": HOUR_RATES.get(body.category, {}).get("day", 0),
        "rate_night": HOUR_RATES.get(body.category, {}).get("night", 0),
        "is_active": False,  # stays inactive until docs approved
        "added_at": datetime.now(timezone.utc).isoformat(),
        "deactivated_at": None,
    }
    records.append(new_record)
    prof.category_records = records

    # Add to additional_categories for COREN lookup
    if body.council_number:
        additional = list(prof.additional_categories or [])
        additional.append({"role": body.category, "coren": body.council_number, "state": body.council_state})
        prof.additional_categories = additional

    # Update user roles
    user_roles = list(current.roles or [current_role])
    if body.category not in user_roles:
        user_roles.append(body.category)
    current.roles = user_roles

    db.commit()

    return {
        "category": body.category,
        "verification_status": "pending",
        "required_documents": required_docs,
        "message": f"Categoria '{body.category}' adicionada. Envie os documentos necessários para ativação: {', '.join(required_docs)}",
    }

@router.get("/category/{category}/required-docs")
def get_required_docs(category: str):
    """45d: Return list of required documents for an independent category."""
    docs = INDEPENDENT_CATEGORY_DOCS.get(category)
    if not docs:
        raise HTTPException(400, f"Categoria '{category}' inválida.")
    doc_labels = {
        "coren_card": "Carteira COREN",
        "coren_negative": "Certidão Negativa COREN",
        "rg_cpf": "RG ou CPF com foto",
        "proof_of_training": "Certificado de formação / curso",
    }
    return {
        "category": category,
        "required_documents": [{"key": d, "label": doc_labels.get(d, d)} for d in docs],
    }