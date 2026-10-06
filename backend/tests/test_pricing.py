"""
Unit tests for CuidaU pricing engine v2 (minute-precision).
Run: cd backend && python -m pytest tests/test_pricing.py -v
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime

from app.utils.pricing import (
    calculate_price,
    distance_fee,
    detect_shift,
    is_night_hour,
    minimum_role_for_services,
    professional_can_perform,
    get_service_level,
    get_care_level_for_services,
    _count_day_night_minutes,
    HOUR_RATES,
    INITIAL_SERVICE_FEE,
    MINIMUM_DURATION_MINUTES,
    VALID_MARKUPS,
    COMMISSION_RATE,
    CAREGIVER_SERVICES,
    NURSING_ASSISTANT_SERVICES,
    TECHNICIAN_SERVICES,
    NURSE_SERVICES,
    LEVEL_1_SERVICES,
    LEVEL_2_SERVICES,
    LEVEL_3_SERVICES,
    LEVEL_4_SERVICES,
    SPECIALTIES_BY_ROLE,
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Shift detection
# ─────────────────────────────────────────────────────────────────────────────

class TestShiftDetection:
    def test_day_hours(self):
        for h in [6, 7, 10, 14, 18, 21]:
            assert detect_shift(h) == "day", f"Hour {h} should be day"

    def test_night_hours(self):
        for h in [22, 23, 0, 1, 3, 5]:
            assert detect_shift(h) == "night", f"Hour {h} should be night"

    def test_boundary_22_is_night(self):
        assert is_night_hour(22) is True

    def test_boundary_6_is_day(self):
        assert is_night_hour(6) is False

    def test_boundary_5_is_night(self):
        assert is_night_hour(5) is True

    def test_boundary_21_is_day(self):
        assert is_night_hour(21) is False


# ─────────────────────────────────────────────────────────────────────────────
# 2. Day/night minute counting
# ─────────────────────────────────────────────────────────────────────────────

class TestDayNightMinutes:
    def test_pure_day_shift(self):
        start = datetime(2026, 7, 15, 8, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = _count_day_night_minutes(start, end)
        assert result["day"] == 240
        assert result["night"] == 0

    def test_pure_night_shift(self):
        start = datetime(2026, 7, 15, 22, 0)
        end = datetime(2026, 7, 16, 2, 0)
        result = _count_day_night_minutes(start, end)
        assert result["day"] == 0
        assert result["night"] == 240

    def test_mixed_day_night(self):
        # 20:00 to 00:00 → 2h day (20-22) + 2h night (22-00)
        start = datetime(2026, 7, 15, 20, 0)
        end = datetime(2026, 7, 16, 0, 0)
        result = _count_day_night_minutes(start, end)
        assert result["day"] == 120
        assert result["night"] == 120

    def test_overnight_crossing_midnight(self):
        # 23:00 to 07:00 → 1h night (23-00) + 6h night (00-06) + 1h day (06-07) = 7h night + 1h day
        start = datetime(2026, 7, 15, 23, 0)
        end = datetime(2026, 7, 16, 7, 0)
        result = _count_day_night_minutes(start, end)
        assert result["night"] == 420  # 7 * 60
        assert result["day"] == 60     # 1 * 60

    def test_full_24h(self):
        start = datetime(2026, 7, 15, 0, 0)
        end = datetime(2026, 7, 16, 0, 0)
        result = _count_day_night_minutes(start, end)
        assert result["day"] + result["night"] == 1440
        # Night: 00-06 (360) + 22-00 (120) = 480
        assert result["night"] == 480
        # Day: 06-22 = 960
        assert result["day"] == 960


# ─────────────────────────────────────────────────────────────────────────────
# 3. Distance fee
# ─────────────────────────────────────────────────────────────────────────────

class TestDistanceFee:
    def test_within_10km_free(self):
        assert distance_fee(0) == 0.0
        assert distance_fee(5) == 0.0
        assert distance_fee(10) == 0.0

    def test_10_to_20km(self):
        assert distance_fee(11) == 15.0
        assert distance_fee(15) == 15.0
        assert distance_fee(20) == 15.0

    def test_20_to_30km(self):
        assert distance_fee(21) == 30.0
        assert distance_fee(25) == 30.0
        assert distance_fee(30) == 30.0

    def test_above_30km(self):
        assert distance_fee(35) == 37.5   # 30 + 5*1.5
        assert distance_fee(50) == 60.0   # 30 + 20*1.5
        assert distance_fee(40) == 45.0   # 30 + 10*1.5

    def test_negative_treated_as_within_10(self):
        assert distance_fee(-5) == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 4. Service level and role matching
# ─────────────────────────────────────────────────────────────────────────────

class TestServiceMatching:
    def test_level_1_services(self):
        for svc in LEVEL_1_SERVICES:
            assert get_service_level(svc) == 1

    def test_level_2_services(self):
        for svc in LEVEL_2_SERVICES:
            assert get_service_level(svc) == 2

    def test_level_3_services(self):
        for svc in LEVEL_3_SERVICES:
            assert get_service_level(svc) == 3

    def test_level_4_services(self):
        for svc in LEVEL_4_SERVICES:
            assert get_service_level(svc) == 4

    def test_unknown_service_level(self):
        assert get_service_level("Serviço inexistente") is None

    def test_care_level_picks_highest(self):
        mixed = [LEVEL_1_SERVICES[0], LEVEL_3_SERVICES[0]]
        assert get_care_level_for_services(mixed) == 3

    def test_empty_services_returns_caregiver(self):
        assert minimum_role_for_services([]) == "caregiver"

    def test_level1_needs_caregiver(self):
        assert minimum_role_for_services(["Banho e higiene pessoal"]) == "caregiver"

    def test_level2_needs_nursing_assistant(self):
        assert minimum_role_for_services(["Glicemia capilar"]) == "nursing_assistant"

    def test_level3_needs_technician(self):
        services = ["Administração de medicamentos intramusculares"]
        assert minimum_role_for_services(services) == "technician"

    def test_level4_needs_nurse(self):
        assert minimum_role_for_services(["Ventilação mecânica domiciliar"]) == "nurse"

    def test_mixed_takes_highest(self):
        services = ["Banho e higiene pessoal", "Ventilação mecânica domiciliar"]
        assert minimum_role_for_services(services) == "nurse"

    def test_unknown_service_returns_none(self):
        assert minimum_role_for_services(["Serviço fake"]) is None

    # professional_can_perform
    def test_caregiver_can_do_level1(self):
        assert professional_can_perform("caregiver", ["Banho e higiene pessoal"]) is True

    def test_caregiver_cannot_do_level2(self):
        assert professional_can_perform("caregiver", ["Glicemia capilar"]) is False

    def test_nurse_can_do_all_levels(self):
        all_svc = [LEVEL_1_SERVICES[0], LEVEL_2_SERVICES[0], LEVEL_3_SERVICES[0], LEVEL_4_SERVICES[0]]
        assert professional_can_perform("nurse", all_svc) is True

    def test_technician_can_do_up_to_level3(self):
        assert professional_can_perform("technician", [LEVEL_3_SERVICES[0]]) is True
        assert professional_can_perform("technician", [LEVEL_4_SERVICES[0]]) is False

    def test_nursing_assistant_can_do_level1_and_2(self):
        assert professional_can_perform("nursing_assistant", [LEVEL_1_SERVICES[0]]) is True
        assert professional_can_perform("nursing_assistant", [LEVEL_2_SERVICES[0]]) is True
        assert professional_can_perform("nursing_assistant", [LEVEL_3_SERVICES[0]]) is False

    def test_unknown_service_cant_perform(self):
        assert professional_can_perform("nurse", ["Fake service"]) is False


# ─────────────────────────────────────────────────────────────────────────────
# 5. Service catalogs consistency
# ─────────────────────────────────────────────────────────────────────────────

class TestServiceCatalogs:
    def test_caregiver_only_level1(self):
        assert set(CAREGIVER_SERVICES) == set(LEVEL_1_SERVICES)

    def test_nursing_assistant_levels_1_and_2(self):
        expected = set(LEVEL_1_SERVICES + LEVEL_2_SERVICES)
        assert set(NURSING_ASSISTANT_SERVICES) == expected

    def test_technician_levels_1_2_3(self):
        expected = set(LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES)
        assert set(TECHNICIAN_SERVICES) == expected

    def test_nurse_all_levels(self):
        expected = set(LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES + LEVEL_4_SERVICES)
        assert set(NURSE_SERVICES) == expected

    def test_no_duplicate_services_in_levels(self):
        all_services = LEVEL_1_SERVICES + LEVEL_2_SERVICES + LEVEL_3_SERVICES + LEVEL_4_SERVICES
        assert len(all_services) == len(set(all_services)), "Duplicate services across levels"

    def test_specialties_exist_for_all_roles(self):
        for role in ["nurse", "technician", "nursing_assistant", "caregiver"]:
            assert role in SPECIALTIES_BY_ROLE
            assert len(SPECIALTIES_BY_ROLE[role]) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 6. Full price calculation (v2 minute-precision)
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculatePrice:
    def test_minimum_2h_daytime_caregiver(self):
        """2h day booking — only initial fee, no extra hours."""
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("caregiver", start, end)
        assert result["duration_minutes"] == 120
        assert result["initial_fee"] == 80.0
        assert result["hour_cost"] == 0.0  # No time beyond 2h
        assert result["base_price"] == 80.0

    def test_3h_daytime_nurse(self):
        """3h = 2h initial fee + 1h extra at day rate."""
        start = datetime(2026, 7, 15, 9, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("nurse", start, end)
        assert result["duration_minutes"] == 180
        assert result["initial_fee"] == 180.0
        assert result["hour_cost"] == 35.0  # 60 min * 35/60
        assert result["base_price"] == 215.0

    def test_under_2h_raises(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 11, 0)
        with pytest.raises(ValueError, match="mínima"):
            calculate_price("nurse", start, end)

    def test_exactly_2h(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("nurse", start, end)
        assert result["duration_minutes"] == 120
        assert result["hour_cost"] == 0.0

    def test_invalid_role(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        with pytest.raises(ValueError, match="Unknown role"):
            calculate_price("doctor", start, end)

    def test_invalid_markup(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        with pytest.raises(ValueError, match="Invalid markup"):
            calculate_price("nurse", start, end, markup_pct=7)

    def test_markup_applied(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("caregiver", start, end, markup_pct=20)
        assert result["markup_amount"] == 16.0  # 80 * 0.20
        assert result["subtotal"] == 96.0

    def test_urgency_surcharge(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("caregiver", start, end, is_urgent=True)
        assert result["surcharge_pct"] == 20.0
        assert result["surcharge_amount"] == 16.0  # 80 * 0.20

    def test_holiday_day_surcharge(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("caregiver", start, end, is_holiday=True)
        assert result["surcharge_pct"] == 20.0
        assert "Feriado (+20%)" in result["surcharge_labels"]

    def test_night_holiday_surcharge(self):
        """Mostly night hours + holiday → 30% surcharge."""
        start = datetime(2026, 7, 15, 23, 0)
        end = datetime(2026, 7, 16, 5, 0)  # 6h, all night
        result = calculate_price("caregiver", start, end, is_holiday=True)
        assert result["primary_shift"] == "night"
        assert result["surcharge_pct"] == 30.0
        assert "Feriado noturno (+30%)" in result["surcharge_labels"]

    def test_urgent_night_holiday_surcharge(self):
        """Night + holiday + urgent → 30% + 20% = 50%."""
        start = datetime(2026, 7, 15, 23, 0)
        end = datetime(2026, 7, 16, 5, 0)
        result = calculate_price("caregiver", start, end, is_urgent=True, is_holiday=True)
        assert result["surcharge_pct"] == 50.0

    def test_distance_fee_included(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("caregiver", start, end, distance_km=25)
        assert result["distance_fee"] == 30.0

    def test_platform_fee_and_pro_payout(self):
        """Client total = pro_payout + platform_fee."""
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 14, 0)
        result = calculate_price("nurse", start, end)
        assert round(result["pro_payout"] + result["platform_fee"], 2) == result["total"]

    def test_commission_rate_default(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("nurse", start, end)
        assert result["commission_pct"] == COMMISSION_RATE

    def test_custom_commission(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 12, 0)
        result = calculate_price("nurse", start, end, commission_pct=15.0)
        assert result["commission_pct"] == 15.0

    def test_overnight_booking(self):
        """Booking from 20:00 to 08:00 (12h) — mixed day/night."""
        start = datetime(2026, 7, 15, 20, 0)
        end = datetime(2026, 7, 16, 8, 0)
        result = calculate_price("nurse", start, end)
        assert result["duration_minutes"] == 720
        # Full split: 20-22 day (120), 22-06 night (480), 06-08 day (120)
        assert result["total_day_minutes"] == 240   # 120 + 120
        assert result["total_night_minutes"] == 480  # 22:00 to 06:00
        assert result["primary_shift"] == "night"

    def test_all_roles_have_rates(self):
        for role in HOUR_RATES:
            assert role in INITIAL_SERVICE_FEE
            assert "day" in HOUR_RATES[role]
            assert "night" in HOUR_RATES[role]

    def test_night_rate_higher_than_day(self):
        for role in HOUR_RATES:
            assert HOUR_RATES[role]["night"] > HOUR_RATES[role]["day"]

    def test_nurse_most_expensive(self):
        assert INITIAL_SERVICE_FEE["nurse"] > INITIAL_SERVICE_FEE["technician"]
        assert INITIAL_SERVICE_FEE["technician"] > INITIAL_SERVICE_FEE["nursing_assistant"]
        assert INITIAL_SERVICE_FEE["nursing_assistant"] > INITIAL_SERVICE_FEE["caregiver"]


# ─────────────────────────────────────────────────────────────────────────────
# 7. Price breakdown structure
# ─────────────────────────────────────────────────────────────────────────────

class TestPriceBreakdown:
    def test_all_keys_present(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 14, 0)
        result = calculate_price("nurse", start, end)
        required_keys = [
            "role", "start_time", "end_time", "duration_minutes", "duration_hours",
            "total_day_minutes", "total_night_minutes",
            "initial_fee", "initial_fee_minutes",
            "extra_day_minutes", "extra_night_minutes",
            "day_rate", "night_rate", "day_cost", "night_cost", "hour_cost",
            "primary_shift", "base_price",
            "markup_pct", "markup_amount", "subtotal",
            "surcharge_pct", "surcharge_amount", "surcharge_labels",
            "distance_km", "distance_fee",
            "total", "commission_pct", "platform_fee", "pro_payout",
        ]
        for key in required_keys:
            assert key in result, f"Missing key: {key}"

    def test_verify_minutes_match(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 16, 0)
        result = calculate_price("nurse", start, end)
        assert result["_verify_minutes"] == result["duration_minutes"]

    def test_verify_line_sum(self):
        start = datetime(2026, 7, 15, 10, 0)
        end = datetime(2026, 7, 15, 16, 0)
        result = calculate_price("nurse", start, end)
        expected = round(result["initial_fee"] + result["day_cost"] + result["night_cost"], 2)
        assert result["_verify_line_sum"] == expected

    def test_total_consistent_all_roles(self):
        """pro_payout + platform_fee = total for every role."""
        start = datetime(2026, 7, 15, 8, 0)
        end = datetime(2026, 7, 15, 14, 0)
        for role in HOUR_RATES:
            result = calculate_price(role, start, end, markup_pct=10, is_urgent=True, distance_km=15)
            assert round(result["pro_payout"] + result["platform_fee"], 2) == result["total"]