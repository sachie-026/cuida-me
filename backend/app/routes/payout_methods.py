"""
Payout methods CRUD — bank account, PIX key, or card.

VERSION 12 Block 6: Professional can save multiple payout methods
and choose a primary one. PIX keys validated by type. Card data
tokenized (never store full number). CPF must match profile.
"""

import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional

from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import User, PayoutMethod

router = APIRouter(prefix="/payout-methods", tags=["payout-methods"])

# ─── PIX key validation ─────────────────────────────────────────

PIX_PATTERNS = {
    "cpf":    r"^\d{11}$",
    "email":  r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    "phone":  r"^\+?55?\d{10,11}$",
    "random": r"^[a-f0-9\-]{32,36}$",
}

def validate_pix_key(key_type: str, key: str) -> bool:
    pattern = PIX_PATTERNS.get(key_type)
    if not pattern:
        return False
    cleaned = re.sub(r"[\.\-\s\(\)]", "", key)
    return bool(re.match(pattern, cleaned))

def clean_cpf(cpf: str) -> str:
    """Strip formatting from CPF."""
    return re.sub(r"\D", "", cpf or "")

def mask_cpf(cpf: str) -> str:
    """Show only first 3 and last 2 digits."""
    c = clean_cpf(cpf)
    if len(c) != 11:
        return "***.***.***-**"
    return f"{c[:3]}.***.**{c[9]}-{c[10]}"

# ─── Pydantic schemas ───────────────────────────────────────────

class PayoutMethodCreate(BaseModel):
    method_type: str  # "bank_account" | "pix" | "card"
    is_primary: bool = False
    # Bank account
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    agency: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None  # "corrente" | "poupanca"
    holder_name: Optional[str] = None
    holder_cpf: Optional[str] = None
    # PIX
    pix_key_type: Optional[str] = None  # "cpf" | "email" | "phone" | "random"
    pix_key: Optional[str] = None
    # Card (tokenized)
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    card_token: Optional[str] = None

    @field_validator("method_type")
    @classmethod
    def valid_type(cls, v):
        if v not in ("bank_account", "pix", "card"):
            raise ValueError("method_type deve ser bank_account, pix ou card")
        return v


class PayoutMethodUpdate(BaseModel):
    is_primary: Optional[bool] = None
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    agency: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None
    holder_name: Optional[str] = None
    holder_cpf: Optional[str] = None
    pix_key_type: Optional[str] = None
    pix_key: Optional[str] = None
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    card_token: Optional[str] = None


def _serialize(pm: PayoutMethod) -> dict:
    return {
        "id": pm.id,
        "method_type": pm.method_type,
        "is_primary": pm.is_primary,
        "bank_name": pm.bank_name,
        "bank_code": pm.bank_code,
        "agency": pm.agency,
        "account_number": pm.account_number,
        "account_type": pm.account_type,
        "holder_name": pm.holder_name,
        "holder_cpf": mask_cpf(pm.holder_cpf) if pm.holder_cpf else None,
        "pix_key_type": pm.pix_key_type,
        "pix_key": pm.pix_key,
        "card_brand": pm.card_brand,
        "card_last4": pm.card_last4,
        # card_token is NEVER exposed to frontend
        "verified": pm.verified,
        "created_at": pm.created_at.isoformat() if pm.created_at else None,
    }


def _get_user_cpf(user: User, db: Session) -> str:
    """Get the CPF from the user's professional profile."""
    from app.models.models import Professional
    pro = db.query(Professional).filter(Professional.user_id == user.id).first()
    if pro and pro.cpf:
        return clean_cpf(pro.cpf)
    return clean_cpf(getattr(user, "cpf", "") or "")


# ─── Endpoints ──────────────────────────────────────────────────

@router.get("")
def list_payout_methods(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all payout methods for the current user."""
    methods = (
        db.query(PayoutMethod)
        .filter(PayoutMethod.user_id == user.id)
        .order_by(PayoutMethod.is_primary.desc(), PayoutMethod.created_at.desc())
        .all()
    )
    return [_serialize(m) for m in methods]


@router.post("", status_code=201)
def create_payout_method(
    body: PayoutMethodCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new payout method."""
    # Validate by type
    if body.method_type == "bank_account":
        if not body.bank_name or not body.agency or not body.account_number:
            raise HTTPException(400, "Banco, agência e conta são obrigatórios.")
        if not body.holder_cpf:
            raise HTTPException(400, "CPF do titular é obrigatório.")
        # CPF must match profile
        user_cpf = _get_user_cpf(user, db)
        given_cpf = clean_cpf(body.holder_cpf)
        if user_cpf and given_cpf and user_cpf != given_cpf:
            raise HTTPException(
                400,
                "O CPF informado não corresponde ao CPF do seu cadastro. "
                "A conta bancária deve pertencer ao mesmo titular do perfil."
            )

    elif body.method_type == "pix":
        if not body.pix_key_type or not body.pix_key:
            raise HTTPException(400, "Tipo e chave PIX são obrigatórios.")
        if body.pix_key_type not in ("cpf", "email", "phone", "random"):
            raise HTTPException(400, "Tipo de chave PIX inválido. Use: cpf, email, phone ou random.")
        if not validate_pix_key(body.pix_key_type, body.pix_key):
            raise HTTPException(400, f"Chave PIX inválida para o tipo '{body.pix_key_type}'.")
        # If PIX key is CPF, it must match profile
        if body.pix_key_type == "cpf":
            user_cpf = _get_user_cpf(user, db)
            given_cpf = clean_cpf(body.pix_key)
            if user_cpf and given_cpf and user_cpf != given_cpf:
                raise HTTPException(
                    400,
                    "A chave PIX (CPF) não corresponde ao CPF do seu cadastro. "
                    "Para evitar fraude, a chave deve pertencer ao mesmo titular."
                )

    elif body.method_type == "card":
        if not body.card_last4 or not body.card_brand:
            raise HTTPException(400, "Bandeira e últimos 4 dígitos são obrigatórios.")
        if len(body.card_last4) != 4 or not body.card_last4.isdigit():
            raise HTTPException(400, "Últimos 4 dígitos devem ser exatamente 4 números.")
        # card_token comes from payment gateway tokenization on frontend
        # We never receive or store the full card number

    # If marking as primary, unset others
    if body.is_primary:
        db.query(PayoutMethod).filter(
            PayoutMethod.user_id == user.id,
            PayoutMethod.is_primary == True,
        ).update({"is_primary": False})

    # If this is the first method, auto-set as primary
    existing_count = db.query(PayoutMethod).filter(PayoutMethod.user_id == user.id).count()
    if existing_count == 0:
        body.is_primary = True

    pm = PayoutMethod(
        user_id=user.id,
        method_type=body.method_type,
        is_primary=body.is_primary,
        bank_name=body.bank_name,
        bank_code=body.bank_code,
        agency=body.agency,
        account_number=body.account_number,
        account_type=body.account_type or "corrente",
        holder_name=body.holder_name,
        holder_cpf=clean_cpf(body.holder_cpf) if body.holder_cpf else None,
        pix_key_type=body.pix_key_type,
        pix_key=body.pix_key,
        card_brand=body.card_brand,
        card_last4=body.card_last4,
        card_token=body.card_token,
    )
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return _serialize(pm)


@router.put("/{method_id}")
def update_payout_method(
    method_id: str,
    body: PayoutMethodUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update an existing payout method."""
    pm = db.query(PayoutMethod).filter(
        PayoutMethod.id == method_id,
        PayoutMethod.user_id == user.id,
    ).first()
    if not pm:
        raise HTTPException(404, "Método de pagamento não encontrado.")

    # If switching PIX key, re-validate
    new_pix_type = body.pix_key_type or pm.pix_key_type
    new_pix_key = body.pix_key or pm.pix_key
    if pm.method_type == "pix" and (body.pix_key_type or body.pix_key):
        if not validate_pix_key(new_pix_type, new_pix_key):
            raise HTTPException(400, f"Chave PIX inválida para o tipo '{new_pix_type}'.")
        if new_pix_type == "cpf":
            user_cpf = _get_user_cpf(user, db)
            given_cpf = clean_cpf(new_pix_key)
            if user_cpf and given_cpf and user_cpf != given_cpf:
                raise HTTPException(400, "A chave PIX (CPF) não corresponde ao CPF do seu cadastro.")

    # CPF check for bank account updates
    if pm.method_type == "bank_account" and body.holder_cpf:
        user_cpf = _get_user_cpf(user, db)
        given_cpf = clean_cpf(body.holder_cpf)
        if user_cpf and given_cpf and user_cpf != given_cpf:
            raise HTTPException(400, "O CPF informado não corresponde ao CPF do seu cadastro.")

    # If setting as primary, unset others
    if body.is_primary:
        db.query(PayoutMethod).filter(
            PayoutMethod.user_id == user.id,
            PayoutMethod.is_primary == True,
            PayoutMethod.id != method_id,
        ).update({"is_primary": False})

    # Apply updates
    update_data = body.model_dump(exclude_unset=True)
    if "holder_cpf" in update_data and update_data["holder_cpf"]:
        update_data["holder_cpf"] = clean_cpf(update_data["holder_cpf"])
    for field, value in update_data.items():
        setattr(pm, field, value)

    db.commit()
    db.refresh(pm)
    return _serialize(pm)


@router.delete("/{method_id}")
def delete_payout_method(
    method_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a payout method."""
    pm = db.query(PayoutMethod).filter(
        PayoutMethod.id == method_id,
        PayoutMethod.user_id == user.id,
    ).first()
    if not pm:
        raise HTTPException(404, "Método de pagamento não encontrado.")

    was_primary = pm.is_primary
    db.delete(pm)
    db.commit()

    # If deleted was primary, promote next one
    if was_primary:
        next_pm = db.query(PayoutMethod).filter(
            PayoutMethod.user_id == user.id
        ).order_by(PayoutMethod.created_at.desc()).first()
        if next_pm:
            next_pm.is_primary = True
            db.commit()

    return {"message": "Método de pagamento removido."}


@router.patch("/{method_id}/primary")
def set_primary(
    method_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set a payout method as the primary one."""
    pm = db.query(PayoutMethod).filter(
        PayoutMethod.id == method_id,
        PayoutMethod.user_id == user.id,
    ).first()
    if not pm:
        raise HTTPException(404, "Método de pagamento não encontrado.")

    # Unset all others
    db.query(PayoutMethod).filter(
        PayoutMethod.user_id == user.id,
        PayoutMethod.is_primary == True,
    ).update({"is_primary": False})

    pm.is_primary = True
    db.commit()
    return {"message": f"{pm.method_type} definido como principal.", "id": pm.id}