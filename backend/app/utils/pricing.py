"""
CuidaU Pricing Engine
=====================
Platform minimum prices by role, duration, and shift.
Admin can update MINIMUM_PRICES at runtime via the admin panel.
Professionals can add a markup of 0–30% in 5% steps.
"""

from typing import Optional

# ── Service catalog by role ──────────────────────────────────────────────────
# Each role inherits services from roles below it.

CAREGIVER_SERVICES = [
    "Acompanhamento / companheirismo",
    "Banho e higiene pessoal",
    "Alimentação assistida",
    "Auxílio à mobilidade",
    "Prevenção de quedas",
    "Cuidados com idosos (Alzheimer, Parkinson, pós-AVC)",
]

TECHNICIAN_EXTRA_SERVICES = [
    "Monitoramento de sinais vitais",
    "Glicemia capilar",
    "Administração de medicamentos",
    "Administração de insulina",
    "Curativo simples",
    "Oxigenoterapia",
    "Cuidados com traqueostomia",
    "Cuidados com ostomia",
    "Cuidados com cateter",
]

NURSE_EXTRA_SERVICES = [
    "Avaliação de enfermagem",
    "Plano de cuidados",
    "Curativo complexo",
    "Cuidados com PICC",
    "Cuidados com Port-a-Cath",
    "Avaliação clínica",
    "Procedimentos especializados de enfermagem",
]

TECHNICIAN_SERVICES = CAREGIVER_SERVICES + TECHNICIAN_EXTRA_SERVICES
NURSE_SERVICES      = TECHNICIAN_SERVICES + NURSE_EXTRA_SERVICES

SERVICES_BY_ROLE = {
    "caregiver":   CAREGIVER_SERVICES,
    "technician":  TECHNICIAN_SERVICES,
    "nurse":       NURSE_SERVICES,
}

# Reverse map: service → minimum role required
def _build_service_role_map():
    m = {}
    for svc in CAREGIVER_SERVICES:
        m[svc] = "caregiver"
    for svc in TECHNICIAN_EXTRA_SERVICES:
        m[svc] = "technician"
    for svc in NURSE_EXTRA_SERVICES:
        m[svc] = "nurse"
    return m

SERVICE_ROLE_MAP = _build_service_role_map()

ROLE_RANK = {"caregiver": 0, "technician": 1, "nurse": 2}

def minimum_role_for_services(services: list) -> Optional[str]:
    """Return the minimum professional role that can perform ALL requested services."""
    if not services:
        return "caregiver"
    max_rank = 0
    for svc in services:
        role = SERVICE_ROLE_MAP.get(svc)
        if role is None:
            return None  # unknown service
        rank = ROLE_RANK.get(role, 0)
        if rank > max_rank:
            max_rank = rank
    return list(ROLE_RANK.keys())[max_rank]

def professional_can_perform(prof_role: str, requested_services: list) -> bool:
    """Return True if a professional's role can perform ALL requested services."""
    required_role = minimum_role_for_services(requested_services)
    if required_role is None:
        return False
    return ROLE_RANK.get(prof_role, -1) >= ROLE_RANK.get(required_role, 99)

# ── Platform minimum prices ───────────────────────────────────────────────────
# Structure: MINIMUM_PRICES[role][duration_hours][shift]
# shift: "day" or "night"
# Admin can update these at runtime via /api/admin/pricing

MINIMUM_PRICES = {
    "caregiver": {
        2:  {"day": 80.0,  "night": 100.0},
        6:  {"day": 140.0, "night": 165.0},
        8:  {"day": 190.0, "night": 220.0},
        12: {"day": 220.0, "night": 265.0},
        24: {"day": 430.0, "night": 500.0},
    },
    "technician": {
        2:  {"day": 120.0, "night": 140.0},
        6:  {"day": 170.0, "night": 200.0},
        8:  {"day": 220.0, "night": 260.0},
        12: {"day": 280.0, "night": 330.0},
        24: {"day": 540.0, "night": 640.0},
    },
    "nurse": {
        2:  {"day": 180.0, "night": 220.0},
        6:  {"day": 300.0, "night": 350.0},
        8:  {"day": 380.0, "night": 450.0},
        12: {"day": 500.0, "night": 600.0},
        24: {"day": 950.0, "night": 1100.0},
    },
}

VALID_DURATIONS  = [2, 6, 8, 12, 24]
VALID_MARKUPS    = [0, 5, 10, 15, 20, 25, 30]
COMMISSION_RATE  = 12.0  # platform commission %

# ── Surcharge rules ───────────────────────────────────────────────────────────
SURCHARGE_URGENT     = 0.20   # <12h notice
SURCHARGE_HOLIDAY    = 0.20
SURCHARGE_NIGHT_HOL  = 0.30   # night + holiday together (replaces both)
DISTANCE_FEE = {
    (0,  10):  0.0,
    (10, 20):  15.0,
    (20, 30):  30.0,
}

def distance_fee(km: float) -> float:
    if km <= 10:
        return 0.0
    elif km <= 20:
        return 15.0
    elif km <= 30:
        return 30.0
    else:
        # Auto-calculate above 30km: R$30 + R$1.50 per km over 30
        return 30.0 + (km - 30) * 1.5

def get_minimum_price(role: str, duration_hours: int, shift: str) -> float:
    """Get platform minimum price. Raises ValueError if params invalid."""
    role_prices = MINIMUM_PRICES.get(role)
    if role_prices is None:
        raise ValueError(f"Unknown role: {role}")
    dur_prices = role_prices.get(duration_hours)
    if dur_prices is None:
        raise ValueError(f"Invalid duration {duration_hours}h. Valid: {VALID_DURATIONS}")
    if shift not in ("day", "night"):
        raise ValueError(f"Invalid shift '{shift}'. Use 'day' or 'night'")
    return dur_prices[shift]

def calculate_price(
    role:           str,
    duration_hours: int,
    shift:          str,
    markup_pct:     int   = 0,
    is_urgent:      bool  = False,
    is_holiday:     bool  = False,
    distance_km:    float = 0.0,
    commission_pct: float = COMMISSION_RATE,
) -> dict:
    """
    Full price calculation.
    Returns dict with all components for transparent display to client.
    """
    # Validate
    if markup_pct not in VALID_MARKUPS:
        raise ValueError(f"Invalid markup {markup_pct}%. Valid: {VALID_MARKUPS}")

    base      = get_minimum_price(role, duration_hours, shift)
    markup    = round(base * markup_pct / 100, 2)
    subtotal  = base + markup

    # Surcharges (applied to subtotal)
    surcharge_pct = 0.0
    surcharge_label = []
    if is_urgent and is_holiday and shift == "night":
        surcharge_pct = SURCHARGE_NIGHT_HOL + SURCHARGE_URGENT
        surcharge_label = ["Feriado noturno (+30%)", "Urgência (+20%)"]
    elif is_holiday and shift == "night":
        surcharge_pct = SURCHARGE_NIGHT_HOL
        surcharge_label = ["Feriado noturno (+30%)"]
    elif is_holiday:
        surcharge_pct = SURCHARGE_HOLIDAY
        surcharge_label = ["Feriado (+20%)"]
        if is_urgent:
            surcharge_pct += SURCHARGE_URGENT
            surcharge_label.append("Urgência (+20%)")
    elif is_urgent:
        surcharge_pct = SURCHARGE_URGENT
        surcharge_label = ["Urgência (+20%)"]

    surcharge_amount = round(subtotal * surcharge_pct, 2)
    dist_fee         = round(distance_fee(distance_km), 2)
    total            = round(subtotal + surcharge_amount + dist_fee, 2)
    platform_fee     = round(total * commission_pct / 100, 2)
    pro_payout       = round(total - platform_fee, 2)

    return {
        "role":             role,
        "duration_hours":   duration_hours,
        "shift":            shift,
        "base_price":       base,
        "markup_pct":       markup_pct,
        "markup_amount":    markup,
        "subtotal":         subtotal,
        "surcharge_pct":    round(surcharge_pct * 100, 1),
        "surcharge_amount": surcharge_amount,
        "surcharge_labels": surcharge_label,
        "distance_km":      distance_km,
        "distance_fee":     dist_fee,
        "total":            total,
        "commission_pct":   commission_pct,
        "platform_fee":     platform_fee,
        "pro_payout":       pro_payout,
    }