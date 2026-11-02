"""
Wallet routes — dummy wallet for tracking payment splits (test/dev + production ledger).
Professionals see their own wallet; admins see platform wallet + all wallets.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth_deps import get_current_user, require_admin
from app.models.models import User, Professional, Wallet, WalletTransaction

router = APIRouter(prefix="/wallet", tags=["wallet"])


def _get_or_create_wallet(db: Session, owner_type: str, owner_id: str = None) -> Wallet:
    """Get existing wallet or create one. For platform, owner_id is None."""
    q = db.query(Wallet).filter(Wallet.owner_type == owner_type)
    if owner_id:
        q = q.filter(Wallet.owner_id == owner_id)
    else:
        q = q.filter(Wallet.owner_id.is_(None))
    wallet = q.first()
    if not wallet:
        wallet = Wallet(owner_type=owner_type, owner_id=owner_id, balance=0.0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


@router.get("/my")
def get_my_wallet(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """Get the current professional's wallet balance + recent transactions."""
    pro = db.query(Professional).filter(Professional.user_id == current.id).first()
    if not pro:
        raise HTTPException(404, "Perfil profissional não encontrado")

    wallet = _get_or_create_wallet(db, "professional", pro.id)
    txns = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(50)
        .all()
    )

    return {
        "wallet_id": wallet.id,
        "balance": wallet.balance,
        "currency": wallet.currency,
        "transactions": [
            {
                "id": tx.id,
                "amount": tx.amount,
                "tx_type": tx.tx_type,
                "description": tx.description,
                "booking_id": tx.booking_id,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            }
            for tx in txns
        ],
    }


@router.get("/platform")
def get_platform_wallet(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: get platform wallet balance + recent transactions."""
    wallet = _get_or_create_wallet(db, "platform")
    txns = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(50)
        .all()
    )

    return {
        "wallet_id": wallet.id,
        "balance": wallet.balance,
        "currency": wallet.currency,
        "transactions": [
            {
                "id": tx.id,
                "amount": tx.amount,
                "tx_type": tx.tx_type,
                "description": tx.description,
                "booking_id": tx.booking_id,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            }
            for tx in txns
        ],
    }


@router.get("/all")
def get_all_wallets(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: list all wallets with balances."""
    wallets = db.query(Wallet).all()
    result = []
    for w in wallets:
        # Resolve professional name if applicable
        name = "CuidaU Platform"
        if w.owner_type == "professional" and w.owner_id:
            pro = db.query(Professional).filter(Professional.id == w.owner_id).first()
            if pro:
                user = db.query(User).filter(User.id == pro.user_id).first()
                name = user.full_name if user else f"Pro {w.owner_id[:8]}"

        result.append({
            "wallet_id": w.id,
            "owner_type": w.owner_type,
            "owner_id": w.owner_id,
            "owner_name": name,
            "balance": w.balance,
            "currency": w.currency,
        })

    return {"wallets": result}