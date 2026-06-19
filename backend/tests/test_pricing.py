"""
Unit tests for CuidaU pricing engine.
Run: python -m pytest backend/tests/test_pricing.py -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from app.utils.pricing import (
    calculate_price, get_minimum_price, distance_fee,
    minimum_role_for_services, professional_can_perform,
    MINIMUM_PRICES, VALID_MARKUPS, VALID_DURATIONS,
    CAREGIVER_SERVICES, TECHNICIAN_EXTRA_SERVICES, NURSE_EXTRA_SERVICES,
)
import pytest

# ─────────────────────────────────────────────────────────────────────────────
# 1. Minimum price table
# ─────────────────────────────────────────────────────────────────────────────

class TestMinimumPrices:
    def test_caregiver_2h_day(self):
        assert get_minimum_price("caregiver", 2, "day") == 80.0

    def test_caregiver_24h_night(self):
        assert get_minimum_price("caregiver", 24, "night") == 500.0

    def test_technician_12h_day(self):
        assert get_minimum_price("technician", 12, "day") == 280.0

    def test_nurse_8h_night(self):
        assert get_minimum_price("nurse", 8, "night") == 450.0

    def test_nurse_24h_day(self):
        assert get_minimum_price("nurse", 24, "day") == 950.0

    def test_invalid_role(self):
        with pytest.raises(ValueError, match="Unknown role"):
            get_minimum_price("doctor", 2, "day")

    def test_invalid_duration(self):
        with pytest.raises(ValueError, match="Invalid duration"):
            get_minimum_price("nurse", 3, "day")

    def test_invalid_shift(self):
        with pytest.raises(ValueError, match="Invalid shift"):
            get_minimum_price("nurse", 2, "evening")

    def test_all_roles_all_durations_present(self):
        for role in ["caregiver", "technician", "nurse"]:
            for dur in VALID_DURATIONS:
                for shift in ["day", "night"]:
                    price = get_minimum_price(role, dur, shift)
                    assert price > 0, f"{role}/{dur}h/{shift} must be > 0"

    def test_night_always_higher_than_day(self):
        for role in ["caregiver", "technician", "nurse"]:
            for dur in VALID_DURATIONS:
                day   = get_minimum_price(role, dur, "day")
                night = get_minimum_price(role, dur, "night")
                assert night > day, f"{role}/{dur}h: night ({night}) should > day ({day})"

    def test_nurse_always_higher_than_technician(self):
        for dur in VALID_DURATIONS:
            for shift in ["day", "night"]:
                nurse = get_minimum_price("nurse", dur, shift)
                tech  = get_minimum_price("technician", dur, shift)
                assert nurse > tech

    def test_technician_always_higher_than_caregiver(self):
        for dur in VALID_DURATIONS:
            for shift in ["day", "night"]:
                tech  = get_minimum_price("technician", dur, shift)
                care  = get_minimum_price("caregiver", dur, shift)
                assert tech > care


# ─────────────────────────────────────────────────────────────────────────────
# 2. Distance fee
# ─────────────────────────────────────────────────────────────────────────────

class TestDistanceFee:
    def test_within_10km_free(self):
        assert distance_fee(0)   == 0.0
        assert distance_fee(5)   == 0.0
        assert distance_fee(10)  == 0.0

    def test_10_to_20km(self):
        assert distance_fee(11) == 15.0
        assert distance_fee(20) == 15.0

    def test_20_to_30km(self):
        assert distance_fee(21) == 30.0
        assert distance_fee(30) == 30.0

    def test_above_30km_auto_calc(self):
        # 35km = 30 + (35-30)*1.5 = 30 + 7.5 = 37.5
        assert distance_fee(35) == 37.5
        # 50km = 30 + (50-30)*1.5 = 30 + 30 = 60
        assert distance_fee(50) == 60.0


# ─────────────────────────────────────────────────────────────────────────────
# 3. Full price calculation
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculatePrice:
    def test_basic_no_surcharges(self):
        result = calculate_price("caregiver", 2, "day", markup_pct=0)
        assert result["base_price"]    == 80.0
        assert result["markup_amount"] == 0.0
        assert result["subtotal"]      == 80.0
        assert result["total"]         == 80.0
        assert result["platform_fee"]  == round(80.0 * 0.12, 2)
        assert result["pro_payout"]    == round(80.0 * 0.88, 2)

    def test_markup_20pct(self):
        result = calculate_price("technician", 24, "day", markup_pct=20)
        base    = 540.0
        markup  = 540.0 * 0.20  # 108
        subtotal = base + markup  # 648
        assert result["base_price"]    == base
        assert result["markup_amount"] == 108.0
        assert result["subtotal"]      == 648.0
        assert result["total"]         == 648.0

    def test_urgency_surcharge(self):
        result = calculate_price("nurse", 2, "day", markup_pct=0, is_urgent=True)
        base      = 180.0
        surcharge = round(180.0 * 0.20, 2)
        assert result["surcharge_pct"]    == 20.0
        assert result["surcharge_amount"] == surcharge
        assert result["total"]            == round(base + surcharge, 2)

    def test_holiday_surcharge(self):
        result = calculate_price("caregiver", 6, "day", markup_pct=0, is_holiday=True)
        base      = 140.0
        surcharge = round(140.0 * 0.20, 2)
        assert result["surcharge_amount"] == surcharge

    def test_night_holiday_combined(self):
        result = calculate_price("nurse", 12, "night", markup_pct=0, is_holiday=True)
        base      = 600.0
        surcharge = round(600.0 * 0.30, 2)  # 30% for night+holiday
        assert result["surcharge_pct"]    == 30.0
        assert result["surcharge_amount"] == surcharge

    def test_urgent_plus_holiday_day(self):
        result = calculate_price("technician", 8, "day", markup_pct=0, is_urgent=True, is_holiday=True)
        base      = 220.0
        surcharge = round(220.0 * 0.40, 2)  # 20% + 20%
        assert result["surcharge_amount"] == surcharge

    def test_distance_fee_added(self):
        result = calculate_price("caregiver", 2, "day", distance_km=15)
        assert result["distance_fee"] == 15.0
        assert result["total"]        == round(80.0 + 15.0, 2)

    def test_all_surcharges_combined(self):
        result = calculate_price(
            "nurse", 12, "night",
            markup_pct=10, is_urgent=True, is_holiday=True, distance_km=25
        )
        base     = 600.0
        markup   = round(600.0 * 0.10, 2)   # 60
        subtotal = base + markup              # 660
        # night+holiday=30% + urgent=20% = 50%
        surcharge = round(660.0 * 0.50, 2)
        dist      = 30.0
        total     = round(subtotal + surcharge + dist, 2)
        assert result["total"] == total

    def test_invalid_markup(self):
        with pytest.raises(ValueError, match="Invalid markup"):
            calculate_price("nurse", 2, "day", markup_pct=7)

    def test_commission_applied_correctly(self):
        result = calculate_price("nurse", 24, "day", commission_pct=12.0)
        assert result["platform_fee"] + result["pro_payout"] == result["total"]

    def test_example_from_doc(self):
        # Doc example: Technician 24h day, 20% markup
        # Min: R$540, +20% = R$108, total = R$648
        result = calculate_price("technician", 24, "day", markup_pct=20)
        assert result["base_price"]    == 540.0
        assert result["markup_amount"] == 108.0
        assert result["total"]         == 648.0


# ─────────────────────────────────────────────────────────────────────────────
# 4. Service matching logic
# ─────────────────────────────────────────────────────────────────────────────

class TestServiceMatching:
    def test_caregiver_only_services_need_caregiver(self):
        services = ["Banho e higiene pessoal", "Alimentação assistida"]
        assert minimum_role_for_services(services) == "caregiver"

    def test_insulin_needs_technician(self):
        services = ["Banho e higiene pessoal", "Administração de insulina"]
        assert minimum_role_for_services(services) == "technician"

    def test_complex_wound_needs_nurse(self):
        services = ["Curativo complexo"]
        assert minimum_role_for_services(services) == "nurse"

    def test_mixed_needs_highest_role(self):
        services = ["Alimentação assistida", "Glicemia capilar", "Avaliação de enfermagem"]
        assert minimum_role_for_services(services) == "nurse"

    def test_empty_services_returns_caregiver(self):
        assert minimum_role_for_services([]) == "caregiver"

    def test_unknown_service_returns_none(self):
        assert minimum_role_for_services(["Serviço inexistente"]) is None

    def test_caregiver_can_do_caregiver_services(self):
        assert professional_can_perform("caregiver", ["Banho e higiene pessoal"]) is True

    def test_caregiver_cannot_do_technician_services(self):
        assert professional_can_perform("caregiver", ["Administração de insulina"]) is False

    def test_technician_can_do_caregiver_services(self):
        assert professional_can_perform("technician", ["Banho e higiene pessoal"]) is True

    def test_technician_can_do_technician_services(self):
        assert professional_can_perform("technician", ["Administração de insulina"]) is True

    def test_technician_cannot_do_nurse_services(self):
        assert professional_can_perform("technician", ["Curativo complexo"]) is False

    def test_nurse_can_do_all_services(self):
        all_svcs = CAREGIVER_SERVICES + TECHNICIAN_EXTRA_SERVICES + NURSE_EXTRA_SERVICES
        assert professional_can_perform("nurse", all_svcs) is True

    def test_nurse_can_do_caregiver_services(self):
        assert professional_can_perform("nurse", ["Acompanhamento / companheirismo"]) is True

    def test_unknown_service_returns_false(self):
        assert professional_can_perform("nurse", ["Serviço inexistente"]) is False


# ─────────────────────────────────────────────────────────────────────────────
# 5. Price breakdown structure completeness
# ─────────────────────────────────────────────────────────────────────────────

class TestPriceBreakdownStructure:
    def test_all_keys_present(self):
        result = calculate_price("nurse", 6, "day")
        required = [
            "role", "duration_hours", "shift", "base_price",
            "markup_pct", "markup_amount", "subtotal",
            "surcharge_pct", "surcharge_amount", "surcharge_labels",
            "distance_km", "distance_fee", "total",
            "commission_pct", "platform_fee", "pro_payout",
        ]
        for key in required:
            assert key in result, f"Missing key: {key}"

    def test_total_equals_components(self):
        for role in ["caregiver", "technician", "nurse"]:
            result = calculate_price(role, 12, "day", markup_pct=10,
                                     is_urgent=True, distance_km=15)
            expected = round(
                result["subtotal"] + result["surcharge_amount"] + result["distance_fee"], 2
            )
            assert result["total"] == expected, f"{role}: total mismatch"

    def test_pro_payout_plus_fee_equals_total(self):
        result = calculate_price("technician", 8, "night", markup_pct=15)
        assert round(result["pro_payout"] + result["platform_fee"], 2) == result["total"]