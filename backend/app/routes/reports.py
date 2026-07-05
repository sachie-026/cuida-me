"""
User Reports System
===================
Allows clients and professionals to report issues after appointments.
Reports are reviewed by admin team.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import Report, User, Booking
from datetime import datetime

router = APIRouter(prefix="/reports", tags=["reports"])

class ReportCreate(BaseModel):
    booking_id:  Optional[str] = None
    reported_id: str
    report_type: str  # "professional" or "client"
    reason:      str
    description: Optional[str] = None

VALID_REASONS = [
    "no_show",
    "unprofessional_behavior",
    "poor_quality",
    "safety_concern",
    "other",
]

@router.post("/", status_code=201)
def create_report(body: ReportCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if body.reason not in VALID_REASONS:
        raise HTTPException(400, f"Invalid reason. Must be one of: {VALID_REASONS}")
    if body.reported_id == current.id:
        raise HTTPException(400, "You cannot report yourself.")
    report = Report(
        booking_id=body.booking_id,
        reporter_id=current.id,
        reported_id=body.reported_id,
        report_type=body.report_type,
        reason=body.reason,
        description=body.description,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

@router.get("/")
def list_reports(status: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Report)
    if status:
        q = q.filter(Report.status == status)
    reports = q.order_by(Report.created_at.desc()).all()
    result = []
    for r in reports:
        reporter = db.query(User).filter(User.id == r.reporter_id).first()
        reported = db.query(User).filter(User.id == r.reported_id).first()
        result.append({
            "id": r.id,
            "booking_id": r.booking_id,
            "reporter_name": reporter.full_name if reporter else "—",
            "reported_name": reported.full_name if reported else "—",
            "report_type": r.report_type,
            "reason": r.reason,
            "description": r.description,
            "status": r.status,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at,
        })
    return result

@router.patch("/{report_id}/status")
def update_report_status(report_id: str, new_status: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    if new_status not in ("pending", "under_review", "resolved"):
        raise HTTPException(400, "Status must be: pending, under_review, or resolved")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = new_status
    if new_status == "resolved":
        report.resolved_at = datetime.utcnow()
    db.commit()
    return {"id": report_id, "status": new_status}