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
            if not existing_cpf.is_active:
                raise HTTPException(status_code=403, detail="Este CPF pertence a uma conta suspensa ou banida. Entre em contato com o suporte.")
            raise HTTPException(status_code=409, detail="Este CPF já possui uma conta. Faça login em sua conta existente ou recupere seu acesso.")
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
    user_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    user_roles = user.roles if user.roles and len(user.roles) > 0 else [user_role]
    has_pro = getattr(user, 'has_professional_profile', False) or user_role in PRO_ROLES
    # P3-1: Also check if Professional record exists (catches stuck records)
    if not has_pro:
        existing_pro = db.query(Professional).filter(Professional.user_id == user.id).first()
        if existing_pro:
            has_pro = True
            user.has_professional_profile = True
            if user_role not in PRO_ROLES and "professional_pending" not in user_roles:
                user_roles.append("professional_pending")
                user.roles = user_roles
            db.commit()
    return TokenResponse(
        access_token=token, role=user_role,
        user_id=user.id, full_name=user.full_name, email=user.email,
        roles=user_roles,
        has_client_profile=getattr(user, 'has_client_profile', False) or user_role == "client",
        has_professional_profile=has_pro,
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
    channel: str = "sms"  # "sms" or "whatsapp"

class PhoneCodeConfirm(BaseModel):
    phone: str
    code:  str

def _send_whatsapp(phone: str, code: str) -> bool:
    """10.2-4: Send OTP via WhatsApp (Twilio or Zenvia)."""
    if SMS_PROVIDER == "twilio":
        try:
            from twilio.rest import Client
            client = Client(os.getenv("TWILIO_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
            client.messages.create(
                body=f"CuidaU: Seu código de verificação é {code}. Válido por 10 minutos.",
                from_=f'whatsapp:{os.getenv("TWILIO_WHATSAPP", os.getenv("TWILIO_PHONE"))}',
                to=f'whatsapp:{phone}',
            )
            return True
        except Exception as e:
            print(f"WhatsApp send failed: {e}"); return False
    elif SMS_PROVIDER == "zenvia":
        try:
            import httpx
            resp = httpx.post("https://api.zenvia.com/v2/channels/whatsapp/messages", json={
                "from": os.getenv("ZENVIA_SENDER"),
                "to": phone,
                "contents": [{"type": "text", "text": f"CuidaU: Seu código de verificação é {code}. Válido por 10 minutos."}]
            }, headers={"X-API-TOKEN": os.getenv("ZENVIA_TOKEN")})
            return resp.status_code == 200
        except Exception as e:
            print(f"WhatsApp send failed: {e}"); return False
    else:
        print(f"📱 [DEV] WhatsApp OTP for {phone}: {code}")
        return True

@router.post("/phone/send-code")
def send_phone_code(body: PhoneVerifyRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    code = str(random.randint(100000, 999999))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    # 10.2-8: If phone number changed, reset verification
    if current.phone and current.phone != body.phone:
        current.phone_verified = False
        current.phone_status = "not_verified"

    current.phone_otp_code = code
    current.phone_otp_expires = expires
    current.phone = body.phone
    current.phone_status = "in_progress"
    db.commit()

    # Send via selected channel
    if body.channel == "whatsapp":
        sent = _send_whatsapp(body.phone, code)
        channel_label = "WhatsApp"
    else:
        sent = _send_sms(body.phone, code)
        channel_label = "SMS"

    if not sent:
        current.phone_status = "failed"
        db.commit()
        try:
            from app.utils.observability import log_event
            log_event("46", f"{channel_label.lower()}_send_failed", {"phone": body.phone, "user_id": current.id})
        except: pass
        return {"sent": False, "error": f"Não foi possível enviar o código via {channel_label}. Tente novamente.", "can_retry": True, "channel": channel_label}

    try:
        from app.utils.observability import log_event
        log_event("46", f"{channel_label.lower()}_sent", {"phone": body.phone, "user_id": current.id})
    except: pass
    masked = phone[:4] + "*" * (len(phone) - 6) + phone[-2:] if len(phone) > 6 else phone
    return {"sent": True, "channel": channel_label,
            "message": f"Código enviado via {channel_label} para {masked}. Válido por 10 minutos."}

@router.post("/phone/verify-code")
def verify_phone_code(body: PhoneCodeConfirm, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if not current.phone_otp_code:
        raise HTTPException(400, "Nenhum código pendente. Solicite um novo código.")
    if current.phone_otp_expires and current.phone_otp_expires.replace(tzinfo=timezone.utc) < now:
        current.phone_otp_code = None; current.phone_otp_expires = None
        current.phone_status = "expired"
        db.commit()
        raise HTTPException(400, "Código expirado. Solicite um novo código.")
    if current.phone_otp_code != body.code:
        raise HTTPException(400, "Código incorreto. Tente novamente.")
    current.phone_verified = True
    current.phone_status = "verified"
    current.phone_otp_code = None; current.phone_otp_expires = None; current.phone = body.phone
    db.commit()
    return {"verified": True, "message": "Telefone verificado com sucesso!"}

@router.get("/phone/status")
def phone_status(current: User = Depends(get_current_user)):
    return {"phone": current.phone, "phone_verified": current.phone_verified,
            "phone_status": getattr(current, 'phone_status', 'not_verified') or "not_verified",
            "is_verified": current.is_verified}

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

    # P3-3: Check if already has a professional profile — activate it instead of blocking
    existing = db.query(Professional).filter(Professional.user_id == current.id).first()
    if existing:
        # Update existing record with new info if provided
        if body.council_number:
            existing.council_number = body.council_number
        if body.council_state:
            existing.council_state = body.council_state
        if body.professional_role != "caregiver":
            existing.council_type = "COREN"

        # Ensure user roles are updated
        roles = list(current.roles or [current.role.value if hasattr(current.role, 'value') else str(current.role)])
        if body.professional_role not in roles:
            roles.append(body.professional_role)
        current.roles = roles
        current.has_professional_profile = True
        db.commit()

        return {
            "message": f"Perfil profissional atualizado. Categoria: {body.professional_role}. Envie seus documentos para verificação.",
            "professional_id": existing.id,
            "roles": current.roles,
            "existing": True,
        }

    # Create new professional record
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