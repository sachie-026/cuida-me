"""
CuidaU Pricing Engine + Service Catalog
========================================
4-level care classification per functional requirements doc.
"""

from typing import Optional, List

# ── Specialties / areas of experience per role ────────────────────────────────
SPECIALTIES_BY_ROLE = {
    "nurse": [
        "Home Care / Saúde Domiciliar",
        "Gerontologia / Geriatria",
        "Terapia Intensiva (UTI)",
        "Cuidados Paliativos",
        "Oncologia",
        "Cardiologia",
        "Neurologia",
        "Pediatria / Neonatologia",
        "Terapia Infusional / PICC",
        "Estomaterapia (Feridas, Ostomia e Continência)",
    ],
    "technician": [
        "Home Care / Saúde Domiciliar",
        "Cuidado Geriátrico",
        "Terapia Intensiva (UTI)",
        "Cuidados Paliativos",
        "Oncologia",
        "Pediatria / Neonatal",
        "Cuidados com Feridas",
        "Terapia Infusional",
        "Pós-operatório",
        "Reabilitação",
        "Emergência",
    ],
    "nursing_assistant": [
        "Home Care / Saúde Domiciliar",
        "Cuidado de Idosos",
        "Cuidados Paliativos",
        "Cuidado Hospitalar",
        "Pós-operatório",
        "Reabilitação",
        "Curativos Básicos",
        "Higiene e Conforto",
        "Cuidados de Longa Duração",
        "Atenção Primária à Saúde",
    ],
    "caregiver": [
        "Cuidado de Idosos",
        "Demência / Alzheimer",
        "Parkinson",
        "Cuidados Paliativos",
        "Home Care",
        "Apoio a Deficiência",
        "Pós-operatório",
        "Companhia",
        "Higiene Pessoal / AVDs",
        "Lembrete de Medicamentos",
    ],
}

# ── Care Level 1 — Basic Care ─────────────────────────────────────────────────
# Allowed: caregiver, nursing_assistant, technician, nurse
LEVEL_1_SERVICES = [
    "Acompanhamento / companheirismo",
    "Auxílio à mobilidade",
    "Banho e higiene pessoal",
    "Alimentação assistida",
    "Auxílio à deambulação",
    "Mudança de decúbito / reposicionamento",
    "Acompanhamento a consultas",
    "Prevenção de quedas",
    "Cuidados com idosos (Alzheimer, Parkinson, pós-AVC)",
]

# ── Care Level 2 — Basic Nursing Care ─────────────────────────────────────────
# Allowed: nursing_assistant, technician, nurse
LEVEL_2_SERVICES = [
    "Monitoramento de sinais vitais",
    "Monitoramento de pressão arterial",
    "Glicemia capilar",
    "Administração de medicamentos orais",
    "Administração de medicamentos tópicos",
    "Lembrete de medicamentos",
    "Curativo simples",
    "Cuidados básicos com ostomia",
    "Administração de insulina",
]

# ── Care Level 3 — Specialized Care ──────────────────────────────────────────
# Allowed: technician, nurse
LEVEL_3_SERVICES = [
    "Administração de medicamentos intramusculares",
    "Administração de medicamentos endovenosos",
    "Curativo complexo / lesão por pressão",
    "Curativo cirúrgico",
    "Cuidados com traqueostomia",
    "Aspiração de vias aéreas",
    "Cuidados com gastrostomia",
    "Cuidados com jejunostomia",
    "Administração de dieta enteral",
    "Cuidados com colostomia",
    "Cuidados com ileostomia",
    "Cuidados com cateter urinário",
    "Cuidados com cistostomia",
    "Cuidados paliativos",
]

# ── Care Level 4 — Advanced Care ─────────────────────────────────────────────
# Allowed: nurse ONLY
LEVEL_4_SERVICES = [
    "Ventilação mecânica domiciliar",
    "Nutrição parenteral",
    "Cuidados críticos domiciliares",
    "Suporte respiratório complexo",
    "Avaliação clínica de enfermagem",
    "Plano de cuidados de enfermagem",
    "Cuidados com PICC",
    "Cuidados com Port-a-Cath",
    "Procedimentos especializados de enfermagem",
]

# ── Combined catalogs by role ─────────────────────────────────────────────────
CAREGIVER_SERVICES         = LEVEL_1_SERVICES
NURSING_ASSISTANT_SERVICES = LEVEL_1_SERVICES + LEVEL_2_SERVICES
TECHNICIAN_SERVICES        = LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES
NURSE_SERVICES             = LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES + LEVEL_4_SERVICES

SERVICES_BY_ROLE = {
    "caregiver":         CAREGIVER_SERVICES,
    "nursing_assistant": NURSING_ASSISTANT_SERVICES,
    "technician":        TECHNICIAN_SERVICES,
    "nurse":             NURSE_SERVICES,
}

SERVICES_BY_LEVEL = {
    1: LEVEL_1_SERVICES,
    2: LEVEL_2_SERVICES,
    3: LEVEL_3_SERVICES,
    4: LEVEL_4_SERVICES,
}

# ── Role ranking ──────────────────────────────────────────────────────────────
ROLE_RANK = {"caregiver": 0, "nursing_assistant": 1, "technician": 2, "nurse": 3}

def _build_service_role_map():
    m = {}
    for svc in LEVEL_1_SERVICES:
        m[svc] = "caregiver"
    for svc in LEVEL_2_SERVICES:
        m[svc] = "nursing_assistant"
    for svc in LEVEL_3_SERVICES:
        m[svc] = "technician"
    for svc in LEVEL_4_SERVICES:
        m[svc] = "nurse"
    return m

SERVICE_ROLE_MAP = _build_service_role_map()

def get_service_level(service: str) -> Optional[int]:
    if service in LEVEL_1_SERVICES: return 1
    if service in LEVEL_2_SERVICES: return 2
    if service in LEVEL_3_SERVICES: return 3
    if service in LEVEL_4_SERVICES: return 4
    return None

def minimum_role_for_services(services: list) -> Optional[str]:
    if not services:
        return "caregiver"
    max_rank = 0
    for svc in services:
        role = SERVICE_ROLE_MAP.get(svc)
        if role is None:
            return None
        rank = ROLE_RANK.get(role, 0)
        if rank > max_rank:
            max_rank = rank
    return list(ROLE_RANK.keys())[max_rank]

def professional_can_perform(prof_role: str, requested_services: list) -> bool:
    required_role = minimum_role_for_services(requested_services)
    if required_role is None:
        return False
    return ROLE_RANK.get(prof_role, -1) >= ROLE_RANK.get(required_role, 99)

def get_care_level_for_services(services: list) -> int:
    """Return the highest care level required by any of the requested services."""
    max_level = 1
    for svc in services:
        level = get_service_level(svc)
        if level and level > max_level:
            max_level = level
    return max_level

# ── Platform minimum prices ───────────────────────────────────────────────────
# ── Platform minimum prices ───────────────────────────────────────────────────
# Values from CuidaNow Pricing Specification (Day/Night Shift doc).
# 4h tier interpolated (mid-point between 2h and 6h).
MINIMUM_PRICES = {
    "caregiver": {
        2:  {"day": 80.0,   "night": 100.0},
        4:  {"day": 110.0,  "night": 130.0},
        6:  {"day": 140.0,  "night": 165.0},
        8:  {"day": 190.0,  "night": 220.0},
        12: {"day": 220.0,  "night": 265.0},
        24: {"day": 450.0,  "night": 530.0},
    },
    "nursing_assistant": {
        2:  {"day": 100.0,  "night": 120.0},
        4:  {"day": 128.0,  "night": 150.0},
        6:  {"day": 155.0,  "night": 180.0},
        8:  {"day": 205.0,  "night": 240.0},
        12: {"day": 250.0,  "night": 295.0},
        24: {"day": 520.0,  "night": 610.0},
    },
    "technician": {
        2:  {"day": 120.0,  "night": 140.0},
        4:  {"day": 145.0,  "night": 170.0},
        6:  {"day": 170.0,  "night": 200.0},
        8:  {"day": 220.0,  "night": 260.0},
        12: {"day": 280.0,  "night": 330.0},
        24: {"day": 580.0,  "night": 690.0},
    },
    "nurse": {
        2:  {"day": 180.0,  "night": 220.0},
        4:  {"day": 240.0,  "night": 285.0},
        6:  {"day": 300.0,  "night": 350.0},
        8:  {"day": 380.0,  "night": 450.0},
        12: {"day": 500.0,  "night": 600.0},
        24: {"day": 980.0,  "night": 1150.0},
    },
}

VALID_DURATIONS = [2, 4, 6, 8, 12, 24]
VALID_MARKUPS   = [0, 5, 10, 15, 20, 25, 30]
COMMISSION_RATE = 12.0

# ── Night shift definition ────────────────────────────────────────────────────
NIGHT_SHIFT_START = 22  # 22:00
NIGHT_SHIFT_END   = 6   # 06:00

def detect_shift(hour: int) -> str:
    """Determine shift from hour (0-23). Night = 22:00-06:00."""
    if hour >= NIGHT_SHIFT_START or hour < NIGHT_SHIFT_END:
        return "night"
    return "day"

# ── Surcharges ────────────────────────────────────────────────────────────────
SURCHARGE_URGENT    = 0.20
SURCHARGE_HOLIDAY   = 0.20
SURCHARGE_NIGHT_HOL = 0.30

def distance_fee(km: float) -> float:
    if km <= 10:  return 0.0
    if km <= 20:  return 15.0
    if km <= 30:  return 30.0
    return round(30.0 + (km - 30) * 1.5, 2)

def get_minimum_price(role: str, duration_hours: int, shift: str) -> float:
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
    if markup_pct not in VALID_MARKUPS:
        raise ValueError(f"Invalid markup {markup_pct}%. Valid: {VALID_MARKUPS}")

    base     = get_minimum_price(role, duration_hours, shift)
    markup   = round(base * markup_pct / 100, 2)
    subtotal = base + markup

    surcharge_pct   = 0.0
    surcharge_label = []

    if is_urgent and is_holiday and shift == "night":
        surcharge_pct   = SURCHARGE_NIGHT_HOL + SURCHARGE_URGENT
        surcharge_label = ["Feriado noturno (+30%)", "Urgência (+20%)"]
    elif is_holiday and shift == "night":
        surcharge_pct   = SURCHARGE_NIGHT_HOL
        surcharge_label = ["Feriado noturno (+30%)"]
    elif is_holiday:
        surcharge_pct   = SURCHARGE_HOLIDAY
        surcharge_label = ["Feriado (+20%)"]
        if is_urgent:
            surcharge_pct  += SURCHARGE_URGENT
            surcharge_label.append("Urgência (+20%)")
    elif is_urgent:
        surcharge_pct   = SURCHARGE_URGENT
        surcharge_label = ["Urgência (+20%)"]

    surcharge_amount = round(subtotal * surcharge_pct, 2)
    dist_fee         = round(distance_fee(distance_km), 2)

    # Commission model: platform fee is ADDED ON TOP of pro's amount
    # Pro receives full amount; client pays pro amount + platform commission
    pro_payout       = round(subtotal + surcharge_amount + dist_fee, 2)
    platform_fee     = round(pro_payout * commission_pct / 100, 2)
    total            = round(pro_payout + platform_fee, 2)

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