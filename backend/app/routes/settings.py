"""
Platform Settings — DB-backed Editable Operating Parameters
============================================================
All values stored in platform_settings table. Backend reads from DB
with hardcoded fallback. Changes take effect immediately, no redeploy needed.
Bookings created BEFORE a change keep the old value (snapshot at creation).
"""
import uuid
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import require_admin
from app.models.models import PlatformSettings, SettingsAuditLog, User

router = APIRouter(prefix="/settings", tags=["settings"])

# ── Default values (used as fallback if DB has no entry) ──────────────────────

DEFAULTS = {
    # Booking rules
    "min_advance_hours":            5,
    "min_booking_hours":            2,
    "urgent_window_start_hours":    5,
    "urgent_window_end_hours":      8,
    "urgent_surcharge_pct":         20,
    "urgent_booking_enabled":       "true",
    "urgent_fee_method":            "percentage",
    "urgent_fixed_amount":          0,
    # Cancellation & refund
    "refund_full_hours":            7,
    "refund_partial_hours":         2,
    "refund_partial_pct":           50,
    "grace_period_minutes":         10,
    "grace_max_uses_30d":           3,
    "penalty_reset_days":           90,
    # Arrival & GPS
    "late_arrival_tolerance_min":   15,
    "late_arrival_public_threshold":3,
    "gps_radius_meters":            500,
    "checkin_reminder_minutes":     25,
    "client_confirm_timeout_hours": 24,
    # Rest
    "rest_after_24h_hours":         11,
    # Day/Night
    "day_start_hour":               6,
    "night_start_hour":             22,
    # Commission
    "platform_commission_pct":      12,
    "holiday_surcharge_pct":        20,
    "holiday_pricing_enabled":      "true",
    "holiday_pricing_method":       "percentage",
    "holiday_specific_rate":        0,
    "holiday_dates":                "2026-01-01,2026-04-21,2026-05-01,2026-09-07,2026-10-12,2026-11-02,2026-11-15,2026-12-25",
    # Pricing per role — initial fees
    "initial_fee_caregiver":        80.0,
    "initial_fee_nursing_assistant":100.0,
    "initial_fee_technician":       120.0,
    "initial_fee_nurse":            180.0,
    # Pricing per role — day rates
    "day_rate_caregiver":           16.0,
    "day_rate_nursing_assistant":   17.0,
    "day_rate_technician":          20.0,
    "day_rate_nurse":               35.0,
    # Pricing per role — night rates
    "night_rate_caregiver":         19.20,
    "night_rate_nursing_assistant": 20.40,
    "night_rate_technician":        24.0,
    "night_rate_nurse":             42.0,
    # Smart matching
    "standard_response_hours":      3,
    "urgent_response_minutes":      90,
    "max_match_batch":              5,
    # Evaluation
    "eval_window_days":             7,
    # 50d: Payment configuration
    "payment_methods_enabled":      "pix,credit_card,debit_card",
    "auto_release_after_hours":     48,
    "dispute_review_hours":         48,
    # 50b: Professional categories
    "enabled_categories":           "nurse,technician,nursing_assistant,caregiver",
    "min_booking_duration_minutes": 120,
    # 50d: Platform content
    "platform_name":                "CuidaU",
    "support_email":                "suporte@cuidau.com.br",
    "support_whatsapp":             "+5511999999999",
    # 50d: General settings
    "maintenance_mode":             "false",
    "allow_new_registrations":      "true",
    # 50-4: Weekend pricing
    "weekend_pricing_enabled":      "false",
    "weekend_saturday_applies":     "true",
    "weekend_sunday_applies":       "true",
    "weekend_pricing_method":       "percentage",
    "weekend_surcharge_pct":        20,
    "weekend_specific_rate":        0,
    # 50-6: Minimum booking price per category
    "min_price_caregiver":          80.0,
    "min_price_nursing_assistant":  100.0,
    "min_price_technician":         120.0,
    "min_price_nurse":              180.0,
    # 50-7: Category active/inactive
    "category_active_caregiver":    "true",
    "category_active_nursing_assistant": "true",
    "category_active_technician":   "true",
    "category_active_nurse":        "true",
    # 50-12: Travel/distance fee
    "travel_fee_enabled":           "false",
    "travel_free_distance_km":      5,
    "travel_fee_method":            "per_km",
    "travel_fee_rate":              2.0,
    # 50-14: Client service fee
    "client_service_fee_enabled":   "false",
    "client_service_fee_method":    "percentage",
    "client_service_fee_pct":       0,
    "client_service_fee_fixed":     0,
    # 50-15: Professional payout
    "professional_payout_pct":      88,
    # 50-22: Max booking duration
    "max_booking_duration_enabled": "false",
    "max_booking_duration_hours":   24,
    # 50-23: Max future booking date
    "max_future_booking_days":      90,
    # 50-24: Max active future bookings per client
    "max_active_bookings_per_client": 10,
    # 50-25: Max consecutive work hours
    "max_consecutive_work_hours":   24,
    # 50-26: Cancellation tier table
    "cancel_tier1_hours":           7,
    "cancel_tier1_refund_pct":      100,
    "cancel_tier1_pro_pct":         0,
    "cancel_tier2_hours":           2,
    "cancel_tier2_refund_pct":      50,
    "cancel_tier2_pro_pct":         50,
    "cancel_tier3_refund_pct":      0,
    "cancel_tier3_pro_pct":         100,
    "cancel_noshow_refund_pct":     0,
    "cancel_noshow_pro_pct":        100,
    # 50-28: Professional cancellation penalties
    "pro_cancel_warning_threshold": 2,
    "pro_cancel_suspend_days_first":7,
    "pro_cancel_suspend_days_repeat":30,
    "pro_cancel_review_threshold":  5,
}

# Validation rules: { field: (min, max, type) }
VALIDATION = {
    "min_advance_hours":            (1, 48, "int"),
    "min_booking_hours":            (1, 24, "int"),
    "urgent_surcharge_pct":         (0, 100, "float"),
    "refund_full_hours":            (1, 48, "int"),
    "refund_partial_hours":         (0, 48, "int"),
    "refund_partial_pct":           (0, 100, "int"),
    "grace_period_minutes":         (1, 60, "int"),
    "grace_max_uses_30d":           (1, 20, "int"),
    "penalty_reset_days":           (30, 365, "int"),
    "late_arrival_tolerance_min":   (5, 60, "int"),
    "late_arrival_public_threshold":(1, 10, "int"),
    "gps_radius_meters":           (100, 5000, "int"),
    "checkin_reminder_minutes":     (10, 60, "int"),
    "client_confirm_timeout_hours": (1, 72, "int"),
    "rest_after_24h_hours":         (6, 24, "int"),
    "day_start_hour":               (0, 23, "int"),
    "night_start_hour":             (0, 23, "int"),
    "platform_commission_pct":      (0, 50, "float"),
    "holiday_surcharge_pct":        (0, 100, "float"),
    "eval_window_days":             (1, 30, "int"),
    "standard_response_hours":      (1, 24, "int"),
    "urgent_response_minutes":      (15, 360, "int"),
    "max_match_batch":              (1, 20, "int"),
}
# Rate fields: min 0, max 1000
for role in ["caregiver", "nursing_assistant", "technician", "nurse"]:
    VALIDATION[f"initial_fee_{role}"] = (0, 1000, "float")
    VALIDATION[f"day_rate_{role}"] = (0, 500, "float")
    VALIDATION[f"night_rate_{role}"] = (0, 500, "float")
    VALIDATION[f"min_price_{role}"] = (0, 2000, "float")

# 50-16: Financial relationship validations
VALIDATION["weekend_surcharge_pct"] = (0, 200, "float")
VALIDATION["weekend_specific_rate"] = (0, 500, "float")
VALIDATION["travel_free_distance_km"] = (0, 100, "int")
VALIDATION["travel_fee_rate"] = (0, 50, "float")
VALIDATION["client_service_fee_pct"] = (0, 50, "float")
VALIDATION["client_service_fee_fixed"] = (0, 500, "float")
VALIDATION["professional_payout_pct"] = (1, 100, "int")
VALIDATION["max_booking_duration_hours"] = (1, 72, "int")
VALIDATION["max_future_booking_days"] = (1, 365, "int")
VALIDATION["max_active_bookings_per_client"] = (1, 100, "int")
VALIDATION["max_consecutive_work_hours"] = (4, 48, "int")
VALIDATION["cancel_tier1_hours"] = (1, 48, "int")
VALIDATION["cancel_tier1_refund_pct"] = (0, 100, "int")
VALIDATION["cancel_tier1_pro_pct"] = (0, 100, "int")
VALIDATION["cancel_tier2_hours"] = (0, 48, "int")
VALIDATION["cancel_tier2_refund_pct"] = (0, 100, "int")
VALIDATION["cancel_tier2_pro_pct"] = (0, 100, "int")
VALIDATION["cancel_tier3_refund_pct"] = (0, 100, "int")
VALIDATION["cancel_tier3_pro_pct"] = (0, 100, "int")
VALIDATION["pro_cancel_warning_threshold"] = (1, 20, "int")
VALIDATION["pro_cancel_suspend_days_first"] = (1, 90, "int")
VALIDATION["pro_cancel_suspend_days_repeat"] = (1, 365, "int")
VALIDATION["pro_cancel_review_threshold"] = (1, 50, "int")

# Cross-validation rules
def _cross_validate(data: dict) -> Optional[str]:
    rf = data.get("refund_full_hours", DEFAULTS["refund_full_hours"])
    rp = data.get("refund_partial_hours", DEFAULTS["refund_partial_hours"])
    if rp >= rf:
        return f"Janela de reembolso parcial ({rp}h) deve ser menor que a de reembolso total ({rf}h)"
    ds = data.get("day_start_hour", DEFAULTS["day_start_hour"])
    ns = data.get("night_start_hour", DEFAULTS["night_start_hour"])
    if ds == ns:
        return "Horário de início Dia e Noite não podem ser iguais"
    # 50-8: Validate 24h coverage — day_start must != night_start, no undefined gaps
    if not (0 <= ds <= 23) or not (0 <= ns <= 23):
        return "Horários devem estar entre 0 e 23"
    if abs(ds - ns) < 4:
        return "Diferença mínima entre períodos diurno e noturno é 4 horas"
    return None

# ── Helper: get current settings (used by all other routes) ───────────────────

def get_setting(key: str, db: Session) -> any:
    """Get a single setting value. Returns DB value if exists, else default."""
    row = db.query(PlatformSettings).filter(PlatformSettings.id == "global").first()
    if row and row.data and key in row.data:
        return row.data[key]
    return DEFAULTS.get(key)

def get_all_settings(db: Session) -> dict:
    """Get all settings merged: DB values over defaults."""
    row = db.query(PlatformSettings).filter(PlatformSettings.id == "global").first()
    result = {**DEFAULTS}
    if row and row.data:
        result.update(row.data)
    return result

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
def get_settings(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Get all platform settings with current values."""
    current = get_all_settings(db)
    return {
        "settings": current,
        "defaults": DEFAULTS,
        "groups": {
            "booking":      ["min_advance_hours", "min_booking_hours", "urgent_window_start_hours",
                            "urgent_window_end_hours", "urgent_surcharge_pct"],
            "cancellation": ["refund_full_hours", "refund_partial_hours", "refund_partial_pct",
                            "grace_period_minutes", "grace_max_uses_30d", "penalty_reset_days"],
            "arrival_gps":  ["late_arrival_tolerance_min", "late_arrival_public_threshold",
                            "gps_radius_meters", "checkin_reminder_minutes", "client_confirm_timeout_hours"],
            "pricing":      [f"{p}_{r}" for p in ["initial_fee", "day_rate", "night_rate"]
                            for r in ["caregiver", "nursing_assistant", "technician", "nurse"]],
            "commission":   ["platform_commission_pct", "holiday_surcharge_pct"],
            "time_ranges":  ["day_start_hour", "night_start_hour", "rest_after_24h_hours"],
            "matching":     ["standard_response_hours", "urgent_response_minutes", "max_match_batch"],
            "evaluation":   ["eval_window_days"],
            "payment":      ["payment_methods_enabled", "auto_release_after_hours", "dispute_review_hours"],
            "categories":   ["enabled_categories", "min_booking_duration_minutes",
                            "category_active_caregiver", "category_active_nursing_assistant",
                            "category_active_technician", "category_active_nurse"],
            "content":      ["platform_name", "support_email", "support_whatsapp"],
            "general":      ["maintenance_mode", "allow_new_registrations"],
            "weekend":      ["weekend_pricing_enabled", "weekend_saturday_applies", "weekend_sunday_applies",
                            "weekend_pricing_method", "weekend_surcharge_pct", "weekend_specific_rate"],
            "travel":       ["travel_fee_enabled", "travel_free_distance_km", "travel_fee_method", "travel_fee_rate"],
            "client_fee":   ["client_service_fee_enabled", "client_service_fee_method",
                            "client_service_fee_pct", "client_service_fee_fixed"],
            "payout":       ["professional_payout_pct"],
            "min_prices":   [f"min_price_{r}" for r in ["caregiver","nursing_assistant","technician","nurse"]],
            "booking_limits": ["max_booking_duration_enabled", "max_booking_duration_hours",
                              "max_future_booking_days", "max_active_bookings_per_client",
                              "max_consecutive_work_hours"],
            "cancel_tiers": ["cancel_tier1_hours", "cancel_tier1_refund_pct", "cancel_tier1_pro_pct",
                            "cancel_tier2_hours", "cancel_tier2_refund_pct", "cancel_tier2_pro_pct",
                            "cancel_tier3_refund_pct", "cancel_tier3_pro_pct",
                            "cancel_noshow_refund_pct", "cancel_noshow_pro_pct"],
            "pro_penalties": ["pro_cancel_warning_threshold", "pro_cancel_suspend_days_first",
                             "pro_cancel_suspend_days_repeat", "pro_cancel_review_threshold"],
        },
    }

class SettingsUpdate(BaseModel):
    updates: dict  # { field: value, ... }

@router.patch("")
@router.patch("/")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    """Update one or more settings. Validates each field before saving."""
    if not body.updates:
        raise HTTPException(400, "No updates provided")

    # 50-34: Enforce sub-role permissions
    FINANCE_FIELDS = {"initial_fee_", "day_rate_", "night_rate_", "platform_commission", "holiday_surcharge", "urgent_surcharge", "holiday_pricing", "urgent_booking", "urgent_fee", "urgent_fixed", "payment_"}
    OPERATIONS_FIELDS = {"min_advance", "min_booking", "max_booking", "grace_", "refund_", "penalty_", "late_arrival", "gps_radius", "checkin_", "rest_after", "day_start", "night_start", "enabled_categories", "eval_window", "standard_response", "urgent_response", "max_match", "arrival_wait"}
    admin_role = getattr(current, 'admin_role', None) or "super_admin"
    if admin_role != "super_admin":
        for field in body.updates:
            is_finance = any(field.startswith(prefix) for prefix in FINANCE_FIELDS)
            is_ops = any(field.startswith(prefix) for prefix in OPERATIONS_FIELDS)
            if admin_role == "finance" and not is_finance:
                raise HTTPException(403, f"Perfil Finance não tem permissão para alterar '{field}'.")
            if admin_role == "operations" and not is_ops:
                raise HTTPException(403, f"Perfil Operations não tem permissão para alterar '{field}'.")
            if admin_role == "support":
                raise HTTPException(403, "Perfil Support não pode alterar configurações.")

    # Validate each field
    for field, value in body.updates.items():
        if field not in DEFAULTS:
            raise HTTPException(400, f"Campo desconhecido: '{field}'")
        if field in VALIDATION:
            vmin, vmax, vtype = VALIDATION[field]
            try:
                value = float(value) if vtype == "float" else int(value)
            except (ValueError, TypeError):
                raise HTTPException(400, f"'{field}' deve ser um número")
            if value < vmin or value > vmax:
                raise HTTPException(400, f"'{field}' deve estar entre {vmin} e {vmax}")
            body.updates[field] = value

    # Get or create settings row
    row = db.query(PlatformSettings).filter(PlatformSettings.id == "global").first()
    if not row:
        row = PlatformSettings(id="global", data={})
        db.add(row)

    old_data = dict(row.data) if row.data else {}

    # 50-43: Concurrent editing warning — check if data changed since client loaded
    # Client can send _loaded_version; if it doesn't match current, warn
    loaded_version = body.updates.pop("_loaded_version", None)
    current_version = old_data.get("_version", 0)
    if loaded_version is not None and int(loaded_version) != int(current_version):
        raise HTTPException(409, "Configurações foram alteradas por outro administrador. Recarregue antes de salvar.")

    # Cross-validate
    merged = {**old_data, **body.updates}
    cross_err = _cross_validate(merged)
    if cross_err:
        raise HTTPException(400, cross_err)

    # 50-16: Financial relationship validation
    payout = float(merged.get("professional_payout_pct", DEFAULTS["professional_payout_pct"]))
    commission = float(merged.get("platform_commission_pct", DEFAULTS["platform_commission_pct"]))
    if payout + commission > 100:
        raise HTTPException(400, f"Payout ({payout}%) + comissão ({commission}%) não pode exceder 100%.")
    if payout <= 0:
        raise HTTPException(400, "Payout do profissional deve ser positivo.")

    # 50-42: Atomic save — all or nothing (single DB commit)
    # 50-36: Increment version
    new_version = int(current_version) + 1
    body.updates["_version"] = new_version

    # Apply updates + create audit log entries
    for field, value in body.updates.items():
        if field.startswith("_"):
            continue
        old_value = old_data.get(field, DEFAULTS.get(field))
        if str(old_value) != str(value):
            audit = SettingsAuditLog(
                id=str(uuid.uuid4()),
                admin_id=current.id,
                admin_name=current.full_name or "Admin",
                field=field,
                old_value=str(old_value),
                new_value=str(value),
            )
            db.add(audit)

    row.data = {**(row.data or {}), **body.updates}
    row.updated_by = current.id
    # 50-42: Single commit = atomic
    db.commit()

    return {"updated": [k for k in body.updates if not k.startswith("_")], "version": new_version,
            "message": "Configurações atualizadas com sucesso."}

@router.get("/audit-log")
def get_settings_audit(limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Get audit log of settings changes."""
    logs = db.query(SettingsAuditLog).order_by(SettingsAuditLog.created_at.desc()).limit(limit).all()
    return [{
        "id": l.id, "admin_id": l.admin_id, "admin_name": l.admin_name,
        "field": l.field, "old_value": l.old_value, "new_value": l.new_value,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    } for l in logs]