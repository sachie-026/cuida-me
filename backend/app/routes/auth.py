from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import User, UserRole, Professional, DocStatus
import httpx, secrets, datetime

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory reset token store (replace with DB/Redis in production)
_reset_tokens: dict = {}  # token -> {user_id, expires_at}

PRO_ROLES = {"nurse", "technician", "caregiver"}

class GoogleAuthRequest(BaseModel):
    credential: str
    role:       str = "client"

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
    token_type:   str  = "bearer"
    role:         str
    user_id:      str
    full_name:    str
    email:        str
    is_new_user:  bool = False

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str

def _create_professional_profile(db: Session, user_id: str):
    existing = db.query(Professional).filter(Professional.user_id == user_id).first()
    if not existing:
        prof = Professional(
            user_id=user_id,
            approval_status=DocStatus.pending,
            is_available=False,
            services_offered=[],
            markup_pct=0,
        )
        db.add(prof)
        db.commit()

@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={body.credential}")
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
                email=email, full_name=full_name, google_id=google_id,
                role=UserRole(body.role), is_active=True, is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
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
        email=body.email, password_hash=hash_password(body.password),
        full_name=body.full_name, phone=body.phone, cpf=body.cpf,
        role=UserRole(body.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if body.role in PRO_ROLES:
        _create_professional_profile(db, user.id)
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        user_id=user.id, full_name=user.full_name, email=user.email,
    )

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada. Entre em contato com o suporte.")
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role,
        user_id=user.id, full_name=user.full_name, email=user.email,
    )

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    # Always return 200 — don't reveal if email exists (security best practice)
    if not user or not user.password_hash:
        return {"message": "Se este e-mail estiver cadastrado, você receberá as instruções em breve."}

    token = secrets.token_urlsafe(32)
    expires = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    _reset_tokens[token] = {"user_id": user.id, "expires_at": expires}

    # TODO: Send email with reset link: /reset-password?token={token}
    # For now, return the token directly in dev mode
    reset_url = f"https://cuida-me-frontend.vercel.app/reset-password?token={token}"
    print(f"[DEV] Password reset link for {body.email}: {reset_url}")

    return {
        "message": "Se este e-mail estiver cadastrado, você receberá as instruções em breve.",
        # Remove dev_reset_url before production
        "dev_reset_url": reset_url,
    }

@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    entry = _reset_tokens.get(body.token)
    if not entry:
        raise HTTPException(400, "Token inválido ou expirado.")
    if datetime.datetime.utcnow() > entry["expires_at"]:
        del _reset_tokens[body.token]
        raise HTTPException(400, "Token expirado. Solicite um novo link.")
    if len(body.new_password) < 8:
        raise HTTPException(400, "A senha deve ter no mínimo 8 caracteres.")

    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado.")

    user.password_hash = hash_password(body.new_password)
    db.commit()
    del _reset_tokens[body.token]  # one-time use

    return {"message": "Senha alterada com sucesso. Faça login com sua nova senha."}