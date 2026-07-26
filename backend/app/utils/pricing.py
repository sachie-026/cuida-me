"""
CuidaU Pricing Engine v2 — Minute-Precision
=============================================
New model: Initial Service Fee + Day/Night Hour Rate × duration in minutes.
No more fixed duration tiers. Supports overnight bookings spanning day+night.
"""

from typing import Optional, List
from datetime import datetime, timezone

# ── Specialties / areas of experience per role ────────────────────────────────
SPECIALTIES_BY_ROLE = {
    "nurse": [
        "Home Care / Saúde Domiciliar", "Gerontologia / Geriatria",
        "Terapia Intensiva (UTI)", "Cuidados Paliativos", "Oncologia",
        "Cardiologia", "Neurologia", "Pediatria / Neonatologia",
        "Terapia Infusional / PICC", "Estomaterapia (Feridas, Ostomia e Continência)",
    ],
    "technician": [
        "Home Care / Saúde Domiciliar", "Cuidado Geriátrico",
        "Terapia Intensiva (UTI)", "Cuidados Paliativos", "Oncologia",
        "Pediatria / Neonatal", "Cuidados com Feridas", "Terapia Infusional",
        "Pós-operatório", "Reabilitação", "Emergência",
    ],
    "nursing_assistant": [
        "Home Care / Saúde Domiciliar", "Cuidado de Idosos",
        "Cuidados Paliativos", "Cuidado Hospitalar", "Pós-operatório",
        "Reabilitação", "Curativos Básicos", "Higiene e Conforto",
        "Cuidados de Longa Duração", "Atenção Primária à Saúde",
    ],
    "caregiver": [
        "Cuidado de Idosos", "Demência / Alzheimer", "Parkinson",
        "Cuidados Paliativos", "Home Care", "Apoio a Deficiência",
        "Pós-operatório", "Companhia", "Higiene Pessoal / AVDs",
        "Lembrete de Medicamentos",
    ],
}

# ── Service catalogs ──────────────────────────────────────────────────────────
LEVEL_1_SERVICES = [
    "Acompanhamento / companheirismo", "Auxílio à mobilidade",
    "Banho e higiene pessoal", "Alimentação assistida",
    "Auxílio à deambulação", "Mudança de decúbito / reposicionamento",
    "Acompanhamento a consultas", "Prevenção de quedas",
    "Cuidados com idosos (Alzheimer, Parkinson, pós-AVC)",
]
LEVEL_2_SERVICES = [
    "Monitoramento de sinais vitais", "Monitoramento de pressão arterial",
    "Glicemia capilar", "Administração de medicamentos orais",
    "Administração de medicamentos tópicos", "Lembrete de medicamentos",
    "Curativo simples", "Cuidados básicos com ostomia", "Administração de insulina",
]
LEVEL_3_SERVICES = [
    "Administração de medicamentos intramusculares",
    "Administração de medicamentos endovenosos",
    "Curativo complexo / lesão por pressão", "Curativo cirúrgico",
    "Cuidados com traqueostomia", "Aspiração de vias aéreas",
    "Cuidados com gastrostomia", "Cuidados com jejunostomia",
    "Administração de dieta enteral", "Cuidados com colostomia",
    "Cuidados com ileostomia", "Cuidados com cateter urinário",
    "Cuidados com cistostomia", "Cuidados paliativos",
]
LEVEL_4_SERVICES = [
    "Ventilação mecânica domiciliar", "Nutrição parenteral",
    "Cuidados críticos domiciliares", "Suporte respiratório complexo",
    "Avaliação clínica de enfermagem", "Plano de cuidados de enfermagem",
    "Cuidados com PICC", "Cuidados com Port-a-Cath",
    "Procedimentos especializados de enfermagem",
]

CAREGIVER_SERVICES         = LEVEL_1_SERVICES
NURSING_ASSISTANT_SERVICES = LEVEL_1_SERVICES + LEVEL_2_SERVICES
TECHNICIAN_SERVICES        = LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES
NURSE_SERVICES             = LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES + LEVEL_4_SERVICES

SERVICES_BY_ROLE = {
    "caregiver": CAREGIVER_SERVICES,
    "nursing_assistant": NURSING_ASSISTANT_SERVICES,
    "technician": TECHNICIAN_SERVICES,
    "nurse": NURSE_SERVICES,
}
SERVICES_BY_LEVEL = {1: LEVEL_1_SERVICES, 2: LEVEL_2_SERVICES, 3: LEVEL_3_SERVICES, 4: LEVEL_4_SERVICES}

ROLE_RANK = {"caregiver": 0, "nursing_assistant": 1, "technician": 2, "nurse": 3}

def _build_service_role_map():
    m = {}
    for svc in LEVEL_1_SERVICES: m[svc] = "caregiver"
    for svc in LEVEL_2_SERVICES: m[svc] = "nursing_assistant"
    for svc in LEVEL_3_SERVICES: m[svc] = "technician"
    for svc in LEVEL_4_SERVICES: m[svc] = "nurse"
    return m

SERVICE_ROLE_MAP = _build_service_role_map()

def get_service_level(service: str) -> Optional[int]:
    if service in LEVEL_1_SERVICES: return 1
    if service in LEVEL_2_SERVICES: return 2
    if service in LEVEL_3_SERVICES: return 3
    if service in LEVEL_4_SERVICES: return 4
    return None

def minimum_role_for_services(services: list) -> Optional[str]:
    if not services: return "caregiver"
    max_rank = 0
    for svc in services:
        role = SERVICE_ROLE_MAP.get(svc)
        if role is None: return None
        rank = ROLE_RANK.get(role, 0)
        if rank > max_rank: max_rank = rank
    return list(ROLE_RANK.keys())[max_rank]

def professional_can_perform(prof_role: str, requested_services: list) -> bool:
    required_role = minimum_role_for_services(requested_services)
    if required_role is None: return False
    return ROLE_RANK.get(prof_role, -1) >= ROLE_RANK.get(required_role, 99)

def get_care_level_for_services(services: list) -> int:
    max_level = 1
    for svc in services:
        level = get_service_level(svc)
        if level and level > max_level: max_level = level
    return max_level

# ── NEW Pricing Model v2 ─────────────────────────────────────────────────────
# Initial Service Fee (one-time) + Hour Rate × hours (minute precision)
# Night hours (22:00-06:00) use night rate, day hours use day rate.

INITIAL_SERVICE_FEE = {
    "caregiver":         30.0,
    "nursing_assistant": 40.0,
    "technician":        50.0,
    "nurse":             70.0,
}

HOUR_RATES = {
    "caregiver":         {"day": 25.0,  "night": 35.0},
    "nursing_assistant": {"day": 35.0,  "night": 45.0},
    "technician":        {"day": 45.0,  "night": 55.0},
    "nurse":             {"day": 65.0,  "night": 80.0},
}

MINIMUM_DURATION_MINUTES = 120  # 2 hours minimum
VALID_MARKUPS   = [0, 5, 10, 15, 20, 25, 30]
COMMISSION_RATE = 12.0

# Night shift definition
NIGHT_SHIFT_START = 22  # 22:00
NIGHT_SHIFT_END   = 6   # 06:00

def detect_shift(hour: int) -> str:
    if hour >= NIGHT_SHIFT_START or hour < NIGHT_SHIFT_END:
        return "night"
    return "day"

def is_night_hour(hour: int) -> bool:
    return hour >= NIGHT_SHIFT_START or hour < NIGHT_SHIFT_END

# ── Surcharges ────────────────────────────────────────────────────────────────
SURCHARGE_URGENT    = 0.20
SURCHARGE_HOLIDAY   = 0.20
SURCHARGE_NIGHT_HOL = 0.30

def distance_fee(km: float) -> float:
    if km <= 10:  return 0.0
    if km <= 20:  return 15.0
    if km <= 30:  return 30.0
    return round(30.0 + (km - 30) * 1.5, 2)

# ── Minute-precision calculation ──────────────────────────────────────────────

def _count_day_night_minutes(start: datetime, end: datetime) -> dict:
    """Count how many minutes fall in day vs night periods."""
    day_minutes = 0
    night_minutes = 0
    current = start
    while current < end:
        if is_night_hour(current.hour):
            night_minutes += 1
        else:
            day_minutes += 1
        from datetime import timedelta
        current += timedelta(minutes=1)
    return {"day": day_minutes, "night": night_minutes}

def calculate_price(
    role:            str,
    start_time:      datetime,
    end_time:        datetime,
    markup_pct:      int   = 0,
    is_urgent:       bool  = False,
    is_holiday:      bool  = False,
    distance_km:     float = 0.0,
    commission_pct:  float = COMMISSION_RATE,
) -> dict:
    """Calculate price using Initial Fee + Hour Rate × time (minute precision)."""
    if role not in HOUR_RATES:
        raise ValueError(f"Unknown role: {role}")
    if markup_pct not in VALID_MARKUPS:
        raise ValueError(f"Invalid markup {markup_pct}%. Valid: {VALID_MARKUPS}")

    total_minutes = (end_time - start_time).total_seconds() / 60
    if total_minutes < MINIMUM_DURATION_MINUTES:
        raise ValueError(f"Duração mínima é {MINIMUM_DURATION_MINUTES // 60} horas ({MINIMUM_DURATION_MINUTES} minutos)")

    # Count day/night minutes
    split = _count_day_night_minutes(start_time, end_time)

    # Calculate hour-rate portion
    day_cost   = round(split["day"] / 60 * HOUR_RATES[role]["day"], 2)
    night_cost = round(split["night"] / 60 * HOUR_RATES[role]["night"], 2)
    hour_cost  = day_cost + night_cost

    # Initial service fee
    initial_fee = INITIAL_SERVICE_FEE[role]

    # Base = initial fee + hour cost
    base = round(initial_fee + hour_cost, 2)

    # Markup
    markup_amount = round(base * markup_pct / 100, 2)
    subtotal = round(base + markup_amount, 2)

    # Surcharges
    surcharge_pct = 0.0
    surcharge_labels = []
    primary_shift = "night" if split["night"] > split["day"] else "day"

    if is_urgent and is_holiday and primary_shift == "night":
        surcharge_pct = SURCHARGE_NIGHT_HOL + SURCHARGE_URGENT
        surcharge_labels = ["Feriado noturno (+30%)", "Urgência (+20%)"]
    elif is_holiday and primary_shift == "night":
        surcharge_pct = SURCHARGE_NIGHT_HOL
        surcharge_labels = ["Feriado noturno (+30%)"]
    elif is_holiday:
        surcharge_pct = SURCHARGE_HOLIDAY
        surcharge_labels = ["Feriado (+20%)"]
        if is_urgent:
            surcharge_pct += SURCHARGE_URGENT
            surcharge_labels.append("Urgência (+20%)")
    elif is_urgent:
        surcharge_pct = SURCHARGE_URGENT
        surcharge_labels = ["Urgência (+20%)"]

    surcharge_amount = round(subtotal * surcharge_pct, 2)
    dist_fee = round(distance_fee(distance_km), 2)

    # Commission on top
    pro_payout   = round(subtotal + surcharge_amount + dist_fee, 2)
    platform_fee = round(pro_payout * commission_pct / 100, 2)
    total        = round(pro_payout + platform_fee, 2)

    duration_hours = round(total_minutes / 60, 2)

    return {
        "role":             role,
        "start_time":       start_time.isoformat(),
        "end_time":         end_time.isoformat(),
        "duration_minutes": int(total_minutes),
        "duration_hours":   duration_hours,
        "day_minutes":      split["day"],
        "night_minutes":    split["night"],
        "primary_shift":    primary_shift,
        "initial_fee":      initial_fee,
        "day_rate":         HOUR_RATES[role]["day"],
        "night_rate":       HOUR_RATES[role]["night"],
        "day_cost":         day_cost,
        "night_cost":       night_cost,
        "hour_cost":        hour_cost,
        "base_price":       base,
        "markup_pct":       markup_pct,
        "markup_amount":    markup_amount,
        "subtotal":         subtotal,
        "surcharge_pct":    round(surcharge_pct * 100, 1),
        "surcharge_amount": surcharge_amount,
        "surcharge_labels": surcharge_labels,
        "distance_km":      distance_km,
        "distance_fee":     dist_fee,
        "total":            total,
        "commission_pct":   commission_pct,
        "platform_fee":     platform_fee,
        "pro_payout":       pro_payout,
    }

# ── Legacy compatibility ──────────────────────────────────────────────────────
# Keep MINIMUM_PRICES for admin pricing table display (read-only reference)
MINIMUM_PRICES = {
    role: {
        "initial_fee": INITIAL_SERVICE_FEE[role],
        "day_rate": HOUR_RATES[role]["day"],
        "night_rate": HOUR_RATES[role]["night"],
    }
    for role in HOUR_RATES
}