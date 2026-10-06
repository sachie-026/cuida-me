"""
Unit tests for Brazilian holiday detection.
Run: cd backend && python -m pytest tests/test_holidays.py -v
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import date

from app.utils.holidays import (
    _easter,
    _moveable_holidays,
    is_national_holiday,
    check_date_for_holiday,
    get_year_holidays,
    FIXED_NATIONAL_HOLIDAYS,
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Easter computation
# ─────────────────────────────────────────────────────────────────────────────

class TestEaster:
    """Known Easter dates to verify the algorithm."""

    def test_easter_2024(self):
        assert _easter(2024) == date(2024, 3, 31)

    def test_easter_2025(self):
        assert _easter(2025) == date(2025, 4, 20)

    def test_easter_2026(self):
        assert _easter(2026) == date(2026, 4, 5)

    def test_easter_2027(self):
        assert _easter(2027) == date(2027, 3, 28)

    def test_easter_always_sunday(self):
        for year in range(2020, 2035):
            e = _easter(year)
            assert e.weekday() == 6, f"Easter {year} ({e}) is not Sunday"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Moveable holidays (Easter-based)
# ─────────────────────────────────────────────────────────────────────────────

class TestMoveableHolidays:
    def test_carnival_is_47_and_46_days_before_easter(self):
        from datetime import timedelta
        for year in [2025, 2026]:
            easter = _easter(year)
            moveable = _moveable_holidays(year)
            assert (easter - timedelta(days=47)) in moveable  # Monday
            assert (easter - timedelta(days=46)) in moveable  # Tuesday

    def test_good_friday_is_2_days_before_easter(self):
        from datetime import timedelta
        for year in [2025, 2026]:
            easter = _easter(year)
            moveable = _moveable_holidays(year)
            gf = easter - timedelta(days=2)
            assert gf in moveable
            assert "Sexta-feira Santa" in moveable[gf]

    def test_corpus_christi_is_60_days_after_easter(self):
        from datetime import timedelta
        for year in [2025, 2026]:
            easter = _easter(year)
            moveable = _moveable_holidays(year)
            cc = easter + timedelta(days=60)
            assert cc in moveable
            assert "Corpus Christi" in moveable[cc]

    def test_easter_itself_is_included(self):
        moveable = _moveable_holidays(2026)
        easter = _easter(2026)
        assert easter in moveable
        assert "Páscoa" in moveable[easter]

    def test_returns_5_moveable_holidays(self):
        moveable = _moveable_holidays(2026)
        assert len(moveable) == 5


# ─────────────────────────────────────────────────────────────────────────────
# 3. Fixed national holidays
# ─────────────────────────────────────────────────────────────────────────────

class TestFixedHolidays:
    def test_new_years(self):
        assert is_national_holiday(date(2026, 1, 1)) == "Ano Novo"

    def test_tiradentes(self):
        assert is_national_holiday(date(2026, 4, 21)) == "Tiradentes"

    def test_labor_day(self):
        assert is_national_holiday(date(2026, 5, 1)) == "Dia do Trabalho"

    def test_independence(self):
        assert is_national_holiday(date(2026, 9, 7)) == "Independência do Brasil"

    def test_aparecida(self):
        assert is_national_holiday(date(2026, 10, 12)) == "Nossa Senhora Aparecida"

    def test_finados(self):
        assert is_national_holiday(date(2026, 11, 2)) == "Finados"

    def test_republic(self):
        assert is_national_holiday(date(2026, 11, 15)) == "Proclamação da República"

    def test_consciencia_negra(self):
        assert is_national_holiday(date(2026, 11, 20)) == "Dia da Consciência Negra"

    def test_christmas(self):
        assert is_national_holiday(date(2026, 12, 25)) == "Natal"

    def test_regular_day_returns_none(self):
        assert is_national_holiday(date(2026, 7, 15)) is None

    def test_fixed_holidays_count(self):
        assert len(FIXED_NATIONAL_HOLIDAYS) == 9


# ─────────────────────────────────────────────────────────────────────────────
# 4. check_date_for_holiday
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckDateForHoliday:
    def test_national_holiday_detected(self):
        result = check_date_for_holiday("2026-12-25")
        assert result["is_holiday"] is True
        assert result["holiday_name"] == "Natal"
        assert result["scope"] == "national"

    def test_moveable_holiday_detected(self):
        # Good Friday 2026: Easter is April 5, so GF is April 3
        result = check_date_for_holiday("2026-04-03")
        assert result["is_holiday"] is True
        assert "Sexta-feira Santa" in result["holiday_name"]

    def test_regular_day(self):
        result = check_date_for_holiday("2026-07-15")
        assert result["is_holiday"] is False
        assert result["holiday_name"] is None

    def test_invalid_date_format(self):
        result = check_date_for_holiday("invalid-date")
        assert result["is_holiday"] is False

    def test_no_db_session_still_works(self):
        result = check_date_for_holiday("2026-01-01", db=None)
        assert result["is_holiday"] is True


# ─────────────────────────────────────────────────────────────────────────────
# 5. get_year_holidays
# ─────────────────────────────────────────────────────────────────────────────

class TestGetYearHolidays:
    def test_returns_all_national_holidays(self):
        holidays = get_year_holidays(2026)
        # 9 fixed + 5 moveable = 14
        assert len(holidays) == 14

    def test_sorted_by_date(self):
        holidays = get_year_holidays(2026)
        dates = [h["date"] for h in holidays]
        assert dates == sorted(dates)

    def test_all_have_required_fields(self):
        for h in get_year_holidays(2026):
            assert "date" in h
            assert "name" in h
            assert "scope" in h
            assert h["scope"] == "national"

    def test_moveable_flag_present(self):
        holidays = get_year_holidays(2026)
        moveable = [h for h in holidays if h.get("moveable")]
        assert len(moveable) == 5

    def test_different_years_different_moveables(self):
        h2025 = {h["date"] for h in get_year_holidays(2025) if h.get("moveable")}
        h2026 = {h["date"] for h in get_year_holidays(2026) if h.get("moveable")}
        assert h2025 != h2026  # Easter shifts, so moveable dates differ