from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import User, UserRole, Professional, DocStatus
import httpx

router = APIRouter(prefix="/auth", tags=["auth"])

class GoogleAuthRequest(BaseModel):
    credential: str
    role: str = "client"

class RegisterRequest(BaseModel):
    email:     EmailStr
    password:  str
    full_name: str
    phone:     Optional[str] = None
    cpf:       Optional[str] = None
    role:      str = "client"

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    user_id:      str
    full_name:    str
    email:        str
    is_new_user:  bool = False

def _create_professional_profile(db: Session, user_id: str):
    """Auto-create a pending Professional profile when a pro registers."""
    existing = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not existing:
        prof = Professional(
            user_id=user_id,
            approval_status=DocStatus.pending,
            is_available=False,
        )
        db.add(prof)
        db.commit()

def _redirect_role(role: str) -> str:
    return ROLE_HOME.get(role, "/dashboard/client")

ROLE_HOME = {
    "client":     "/dashboard/client",
    "nurse":      "/dashboard/professional",
    "technician": "/dashboard/professional",
    "caregiver":  "/dashboard/professional",
    "admin":      "/admin",
}

PRO_ROLES = {"nurse", "technician", "caregiver"}

@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={body.credential}"
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    info      = resp.json()
    google_id = info.get("sub")
    email     = info.get("email")
    full_name = info.get("name", "")
    is_new    = False

    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
        else:
            if body.role == "check":
                return TokenResponse(
                    access_token="", role="", user_id="",
                    full_name=full_name, email=email, is_new_user=True,
                )
            is_new = True
            user = User(
                email=email, full_name=full_name,
                google_id=google_id,
                role=UserRole(body.role),
                is_active=True, is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            # Auto-create professional profile
            if body.role in PRO_ROLES:
                _create_professional_profile(db, user.id)

    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        user_id=user.id, full_name=user.full_name,
        email=user.email, is_new_user=is_new,
    )

@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email já cadastrado.")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        cpf=body.cpf,
        role=UserRole(body.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create professional profile for pro roles
    if body.role in PRO_ROLES:
        _create_professional_profile(db, user.id)

    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        user_id=user.id, full_name=user.full_name,
        email=user.email,
    )

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        user_id=user.id, full_name=user.full_name,
        email=user.email,
    )