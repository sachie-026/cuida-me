"""
Brazilian Holiday Detection
============================
Automatically detects national holidays for a given date.
State/municipal holidays can be added via the admin panel to the DB.
"""
from datetime import date, datetime
from typing import Optional

# Fixed national holidays (month, day) → name
FIXED_NATIONAL_HOLIDAYS = {
    (1,  1):  "Ano Novo",
    (4,  21): "Tiradentes",
    (5,  1):  "Dia do Trabalho",
    (9,  7):  "Independência do Brasil",
    (10, 12): "Nossa Senhora Aparecida",
    (11, 2):  "Finados",
    (11, 15): "Proclamação da República",
    (11, 20): "Dia da Consciência Negra",
    (12, 25): "Natal",
}

def _easter(year: int) -> date:
    """Compute Easter Sunday using the Anonymous Gregorian algorithm."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day   = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)

def _moveable_holidays(year: int) -> dict:
    """Return moveable holidays (Easter-based) for a given year."""
    easter = _easter(year)
    from datetime import timedelta
    return {
        easter - timedelta(days=47): "Carnaval (Segunda)",
        easter - timedelta(days=46): "Carnaval (Terça-feira)",
        easter - timedelta(days=2):  "Sexta-feira Santa",
        easter:                      "Páscoa",
        easter + timedelta(days=60): "Corpus Christi",
    }

def is_national_holiday(d: date) -> Optional[str]:
    """Return holiday name if the date is a Brazilian national holiday, else None."""
    # Fixed holidays
    name = FIXED_NATIONAL_HOLIDAYS.get((d.month, d.day))
    if name:
        return name
    # Moveable holidays
    moveable = _moveable_holidays(d.year)
    return moveable.get(d)

def check_date_for_holiday(date_str: str, db=None) -> dict:
    """
    Check if a date string (ISO format 'YYYY-MM-DD') is a holiday.
    Also checks DB for state/municipal holidays if db session provided.
    Returns: {is_holiday, holiday_name, scope}
    """
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        return {"is_holiday": False, "holiday_name": None, "scope": None}

    # Check national holidays
    name = is_national_holiday(d)
    if name:
        return {"is_holiday": True, "holiday_name": name, "scope": "national"}

    # Check DB for state/municipal holidays
    if db:
        from app.models.models import HolidayCalendar
        db_holiday = db.query(HolidayCalendar).filter(
            HolidayCalendar.date == date_str
        ).first()
        if db_holiday:
            return {
                "is_holiday":   True,
                "holiday_name": db_holiday.name,
                "scope":        db_holiday.scope,
            }

    return {"is_holiday": False, "holiday_name": None, "scope": None}

def get_year_holidays(year: int) -> list:
    """Return all national holidays for a given year."""
    holidays = []
    for (month, day), name in FIXED_NATIONAL_HOLIDAYS.items():
        holidays.append({
            "date": date(year, month, day).isoformat(),
            "name": name,
            "scope": "national",
        })
    for d, name in _moveable_holidays(year).items():
        holidays.append({
            "date": d.isoformat(),
            "name": name,
            "scope": "national",
            "moveable": True,
        })
    return sorted(holidays, key=lambda x: x["date"])