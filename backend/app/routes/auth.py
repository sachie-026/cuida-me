from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.core.auth_deps import get_current_user
from app.models.models import User, UserRole, Professional, DocStatus
import httpx, secrets

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory reset token store (replace with DB/Redis + email service in production)
_reset_tokens: dict = {}

PRO_ROLES = {"nurse", "technician", "nursing_assistant", "caregiver"}

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
    access_token:    str
    token_type:      str  = "bearer"
    role:            str
    user_id:         str
    full_name:       str
    email:           str
    is_new_user:     bool = False
    approval_status: Optional[str] = None
    roles:           list = []
    has_client_profile:     bool = False
    has_professional_profile: bool = False

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
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name,
        email=user.email, is_new_user=is_new,
    )

@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # Fix 4 — enforce uniqueness, return 409
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="E-mail já cadastrado. Faça login ou use outro e-mail.")
    # 45a: CPF uniqueness check
    if body.cpf:
        existing_cpf = db.query(User).filter(User.cpf == body.cpf).first()
        if existing_cpf:
            raise HTTPException(status_code=409, detail="CPF já cadastrado. Cada CPF pode ter apenas uma conta.")
    is_pro = body.role in PRO_ROLES
    user = User(
        email=body.email, password_hash=hash_password(body.password),
        full_name=body.full_name, phone=body.phone, cpf=body.cpf,
        role=UserRole(body.role),
        roles=[body.role],
        has_client_profile=not is_pro,
        has_professional_profile=is_pro,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if is_pro:
        _create_professional_profile(db, user.id)
    token = create_access_token({"sub": user.id, "role": user.role})
    approval_status = None
    if is_pro:
        prof = db.query(Professional).filter(Professional.user_id == user.id).first()
        approval_status = prof.approval_status.value if prof and hasattr(prof.approval_status, "value") else "pending"
    return TokenResponse(
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name, email=user.email,
        approval_status=approval_status,
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
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name, email=user.email,
        roles=user.roles or [user.role.value],
        has_client_profile=user.has_client_profile or user.role.value == "client",
        has_professional_profile=user.has_professional_profile or user.role.value in PRO_ROLES,
    )

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    # Fix 1 — always return 200, never reveal if email exists
    # Never return the token in the response — send via email only
    if user and user.password_hash:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        _reset_tokens[token] = {"user_id": user.id, "expires_at": expires}
        # TODO: Send email with reset link: /reset-password?token={token}
        # Wire to SendGrid/Resend/SES before production
        reset_url = f"https://cuida-me-frontend.vercel.app/reset-password?token={token}"
        print(f"[DEV PASSWORD RESET] {body.email} → {reset_url}")

    return {"message": "Se este e-mail estiver cadastrado, você receberá as instruções em breve."}

@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    entry = _reset_tokens.get(body.token)
    if not entry:
        raise HTTPException(400, "Token inválido ou expirado.")
    if datetime.now(timezone.utc) > entry["expires_at"]:
        del _reset_tokens[body.token]
        raise HTTPException(400, "Token expirado. Solicite um novo link.")
    if len(body.new_password) < 8:
        raise HTTPException(400, "A senha deve ter no mínimo 8 caracteres.")
    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    del _reset_tokens[body.token]
    return {"message": "Senha alterada com sucesso. Faça login com sua nova senha."}
# ── Changes 46: Phone Verification ────────────────────────────────────────────
import random, os

SMS_PROVIDER = os.getenv("SMS_PROVIDER", "")

def _send_sms(phone: str, code: str) -> bool:
    if SMS_PROVIDER == "twilio":
        try:
            from twilio.rest import Client
            client = Client(os.getenv("TWILIO_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
            client.messages.create(body=f"CuidaU: Seu código é {code}. Válido por 10 min.", from_=os.getenv("TWILIO_PHONE"), to=phone)
            return True
        except Exception as e:
            print(f"SMS failed: {e}"); return False
    elif SMS_PROVIDER == "zenvia":
        try:
            import httpx
            resp = httpx.post("https://api.zenvia.com/v2/channels/sms/messages", json={"from": os.getenv("ZENVIA_SENDER"), "to": phone, "contents": [{"type": "text", "text": f"CuidaU: Seu código é {code}. Válido por 10 min."}]}, headers={"X-API-TOKEN": os.getenv("ZENVIA_TOKEN")})
            return resp.status_code == 200
        except Exception as e:
            print(f"SMS failed: {e}"); return False
    else:
        print(f"📱 [DEV] OTP for {phone}: {code}")
        return True

class PhoneVerifyRequest(BaseModel):
    phone: str

class PhoneCodeConfirm(BaseModel):
    phone: str
    code:  str

@router.post("/phone/send-code")
def send_phone_code(body: PhoneVerifyRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    code = str(random.randint(100000, 999999))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    current.phone_otp_code = code
    current.phone_otp_expires = expires
    current.phone = body.phone
    db.commit()
    sent = _send_sms(body.phone, code)
    if not sent:
        try:
            from app.utils.observability import log_event
            log_event("46", "sms_send_failed", {"phone": body.phone, "user_id": current.id})
        except: pass
        return {"sent": False, "error": "Não foi possível enviar o SMS. Tente novamente.", "can_retry": True}
    try:
        from app.utils.observability import log_event
        log_event("46", "sms_sent", {"phone": body.phone, "user_id": current.id})
    except: pass
    return {"sent": True, "message": f"Código enviado para {body.phone}. Válido por 10 minutos."}

@router.post("/phone/verify-code")
def verify_phone_code(body: PhoneCodeConfirm, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if not current.phone_otp_code:
        raise HTTPException(400, "Nenhum código pendente. Solicite um novo código.")
    if current.phone_otp_expires and current.phone_otp_expires.replace(tzinfo=timezone.utc) < now:
        current.phone_otp_code = None; current.phone_otp_expires = None; db.commit()
        raise HTTPException(400, "Código expirado. Solicite um novo código.")
    if current.phone_otp_code != body.code:
        raise HTTPException(400, "Código incorreto. Tente novamente.")
    current.phone_verified = True
    current.phone_otp_code = None; current.phone_otp_expires = None; current.phone = body.phone
    db.commit()
    return {"verified": True, "message": "Telefone verificado com sucesso!"}

@router.get("/phone/status")
def phone_status(current: User = Depends(get_current_user)):
    return {"phone": current.phone, "phone_verified": current.phone_verified, "is_verified": current.is_verified}

@router.get("/sms/health")
def sms_health():
    """46b: Check if SMS provider is configured and ready."""
    provider = SMS_PROVIDER or "dev_stub"
    configured = False
    if provider == "twilio":
        configured = bool(os.getenv("TWILIO_SID") and os.getenv("TWILIO_AUTH_TOKEN") and os.getenv("TWILIO_PHONE"))
    elif provider == "zenvia":
        configured = bool(os.getenv("ZENVIA_TOKEN") and os.getenv("ZENVIA_SENDER"))
    elif provider == "dev_stub":
        configured = True  # always works, prints to logs
    return {
        "provider": provider,
        "configured": configured,
        "production_ready": provider != "dev_stub" and configured,
        "env_vars_needed": {
            "twilio": ["SMS_PROVIDER=twilio", "TWILIO_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE"],
            "zenvia": ["SMS_PROVIDER=zenvia", "ZENVIA_TOKEN", "ZENVIA_SENDER"],
        }.get(provider, []),
    }

# ── 45a/45b: Add Professional Profile to existing Client account ──────────────

class BecomeProfessionalRequest(BaseModel):
    professional_role: str  # nurse, technician, nursing_assistant, caregiver
    council_number: Optional[str] = None
    council_state: Optional[str] = None

@router.post("/become-professional")
def become_professional(body: BecomeProfessionalRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """45b: Client adds a Professional profile to their existing account."""
    if body.professional_role not in PRO_ROLES:
        raise HTTPException(400, f"Categoria inválida. Use: {PRO_ROLES}")

    # Check if already has a professional profile
    existing = db.query(Professional).filter(Professional.user_id == current.id).first()
    if existing:
        raise HTTPException(400, "Você já possui um perfil profissional.")

    # Create professional record
    prof = Professional(
        user_id=current.id,
        council_number=body.council_number,
        council_state=body.council_state,
        council_type="COREN" if body.professional_role != "caregiver" else None,
        approval_status=DocStatus.pending,
    )
    db.add(prof)

    # Update user roles
    roles = list(current.roles or [current.role.value])
    if body.professional_role not in roles:
        roles.append(body.professional_role)
    current.roles = roles
    current.has_professional_profile = True

    db.commit()
    db.refresh(prof)

    return {
        "message": f"Perfil profissional criado como {body.professional_role}. Envie seus documentos para verificação.",
        "professional_id": prof.id,
        "roles": current.roles,
    }