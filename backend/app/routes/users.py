from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.core.database import get_db
from app.models.models import User, Professional, Patient
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["users"])

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone:     Optional[str] = None
    cpf:       Optional[str] = None

class ProfessionalProfileUpdate(BaseModel):
    council_number: Optional[str] = None
    council_state:  Optional[str] = None
    specialties:    Optional[List[str]] = None
    service_radius: Optional[int] = None
    city:           Optional[str] = None
    state:          Optional[str] = None
    hourly_rate:    Optional[float] = None
    is_available:   Optional[bool] = None

class PatientUpdate(BaseModel):
    patient_name: Optional[str] = None
    age:          Optional[int] = None
    relation:     Optional[str] = None
    diagnoses:    Optional[str] = None
    allergies:    Optional[str] = None
    medications:  Optional[str] = None
    address:      Optional[str] = None

@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user

@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user

@router.patch("/{user_id}/professional-profile")
def update_professional_profile(user_id: str, body: ProfessionalProfileUpdate, db: Session = Depends(get_db)):
    prof = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not prof:
        from app.models.models import DocStatus
        prof = Professional(user_id=user_id, approval_status=DocStatus.pending, is_available=False)
        db.add(prof)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof

@router.get("/{user_id}/patient")
def get_patient(user_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient

@router.patch("/{user_id}/patient")
def update_patient(user_id: str, body: PatientUpdate, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(patient, k, v)
    db.commit()
    db.refresh(patient)
    return patient