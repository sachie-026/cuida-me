from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import HolidayCalendar, User
from app.utils.holidays import check_date_for_holiday, get_year_holidays

router = APIRouter(prefix="/holidays", tags=["holidays"])

class HolidayCreate(BaseModel):
    date:  str
    name:  str
    scope: str = "national"
    state: Optional[str] = None
    city:  Optional[str] = None

@router.get("/check")
def check_holiday(date: str, state: Optional[str] = None, city: Optional[str] = None, db: Session = Depends(get_db)):
    """Check if a date is a holiday. Public endpoint — used by booking flow."""
    return check_date_for_holiday(date, db)

@router.get("/year/{year}")
def get_holidays_for_year(year: int, db: Session = Depends(get_db)):
    """Get all national holidays for a year. Used by frontend calendar."""
    national = get_year_holidays(year)
    # Get DB holidays too
    db_holidays = db.query(HolidayCalendar).filter(
        HolidayCalendar.date.like(f"{year}-%")
    ).all()
    for h in db_holidays:
        national.append({
            "date":  h.date,
            "name":  h.name,
            "scope": h.scope,
            "state": h.state,
            "city":  h.city,
        })
    return sorted(national, key=lambda x: x["date"])

@router.get("/admin/custom")
def get_custom_holidays(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: get all custom (state/municipal) holidays."""
    return db.query(HolidayCalendar).order_by(HolidayCalendar.date).all()

@router.post("/admin/custom", status_code=201)
def add_custom_holiday(body: HolidayCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: add a state or municipal holiday."""
    if body.scope not in ("national", "state", "municipal"):
        raise HTTPException(400, "scope must be 'national', 'state', or 'municipal'")
    h = HolidayCalendar(**body.dict())
    db.add(h)
    db.commit()
    db.refresh(h)
    return h

@router.delete("/admin/custom/{holiday_id}", status_code=204)
def delete_custom_holiday(holiday_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    h = db.query(HolidayCalendar).filter(HolidayCalendar.id == holiday_id).first()
    if not h:
        raise HTTPException(404, "Holiday not found")
    db.delete(h)
    db.commit()