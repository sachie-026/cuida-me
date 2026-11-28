"""Change 44 — Service Addresses CRUD.
Standalone endpoints; not referenced by any existing route or feature. Safe to
remove entirely without affecting anything else in the app."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth_deps import get_current_user
from app.models.models import ServiceAddress, User
from app.utils.cep_lookup import lookup_cep
from app.utils.geocoding import geocode_address, geocode_structured

router = APIRouter(prefix="/addresses", tags=["addresses"])


class AddressCreate(BaseModel):
    label:        Optional[str] = None
    cep:          Optional[str] = None
    street:       Optional[str] = None
    number:       Optional[str] = None
    complement:   Optional[str] = None
    neighborhood: Optional[str] = None
    city:         Optional[str] = None
    state:        Optional[str] = None
    reference:    Optional[str] = None
    is_default:   bool = False


class AddressUpdate(BaseModel):
    label:        Optional[str] = None
    cep:          Optional[str] = None
    street:       Optional[str] = None
    number:       Optional[str] = None
    complement:   Optional[str] = None
    neighborhood: Optional[str] = None
    city:         Optional[str] = None
    state:        Optional[str] = None
    reference:    Optional[str] = None
    is_default:   Optional[bool] = None


def _serialize(a: ServiceAddress) -> dict:
    return {
        "id": a.id, "label": a.label, "cep": a.cep,
        "street": a.street, "number": a.number, "complement": a.complement,
        "neighborhood": a.neighborhood, "city": a.city, "state": a.state,
        "reference": a.reference, "latitude": a.latitude, "longitude": a.longitude,
        "is_default": a.is_default, "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


def _full_address_string(a: ServiceAddress) -> str:
    parts = []
    if a.street:
        s = a.street
        if a.number:
            s = f"{s}, {a.number}"
        parts.append(s)
    if a.complement:
        parts.append(a.complement)
    if a.neighborhood:
        parts.append(a.neighborhood)
    if a.city:
        parts.append(a.city)
    if a.state:
        parts.append(a.state)
    if a.cep:
        parts.append(f"CEP {a.cep}")
    return ", ".join(p for p in parts if p)


def _clear_other_defaults(db: Session, user_id: str, keep_id: str):
    db.query(ServiceAddress).filter(
        ServiceAddress.user_id == user_id,
        ServiceAddress.id != keep_id,
        ServiceAddress.is_default == True,
    ).update({"is_default": False}, synchronize_session=False)


# ── CEP lookup proxy (read-only helper for frontend autofill) ─────────────────
@router.get("/cep/{cep}")
def cep_lookup(cep: str, _: User = Depends(get_current_user)):
    """Look up a Brazilian CEP via ViaCEP. Auth-gated to prevent abuse."""
    result = lookup_cep(cep)
    if not result:
        raise HTTPException(404, "CEP não encontrado.")
    return result


# ── List ──────────────────────────────────────────────────────────────────────
@router.get("")
def list_addresses(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    rows = db.query(ServiceAddress).filter(
        ServiceAddress.user_id == current.id,
        ServiceAddress.is_active == True,
    ).order_by(ServiceAddress.is_default.desc(), ServiceAddress.created_at.desc()).all()
    return [_serialize(r) for r in rows]


# ── Create ────────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_address(body: AddressCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    a = ServiceAddress(
        user_id=current.id,
        label=body.label, cep=body.cep,
        street=body.street, number=body.number, complement=body.complement,
        neighborhood=body.neighborhood, city=body.city, state=body.state,
        reference=body.reference, is_default=bool(body.is_default),
    )
    # Geocode (optional — returns None if no API key configured, or if the
    # returned point does not validate against the requested city/state —
    # see geocode_structured for why we don't use the free-form geocoder here).
    coords = geocode_structured(a.street, a.number, a.neighborhood, a.city, a.state, a.cep)
    if coords:
        a.latitude, a.longitude = coords

    # Auto-promote to default if this is the user's first address
    existing_count = db.query(ServiceAddress).filter(
        ServiceAddress.user_id == current.id,
        ServiceAddress.is_active == True,
    ).count()
    if existing_count == 0:
        a.is_default = True

    db.add(a)
    db.commit()
    db.refresh(a)
    if a.is_default:
        _clear_other_defaults(db, current.id, a.id)
        db.commit()
    return _serialize(a)


# ── Update ────────────────────────────────────────────────────────────────────
@router.patch("/{address_id}")
def update_address(address_id: str, body: AddressUpdate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    a = db.query(ServiceAddress).filter(ServiceAddress.id == address_id).first()
    if not a or not a.is_active:
        raise HTTPException(404, "Endereço não encontrado.")
    if a.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied.")

    changed_location = False
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        if k == "is_default":
            continue  # handled below
        if k in ("cep", "street", "number", "complement", "neighborhood", "city", "state"):
            if getattr(a, k) != v:
                changed_location = True
        setattr(a, k, v)

    # Re-geocode if any location field changed (uses validated helper)
    if changed_location:
        coords = geocode_structured(a.street, a.number, a.neighborhood, a.city, a.state, a.cep)
        if coords:
            a.latitude, a.longitude = coords

    if body.is_default is True:
        a.is_default = True
    elif body.is_default is False:
        a.is_default = False

    db.commit()
    db.refresh(a)
    if a.is_default:
        _clear_other_defaults(db, current.id, a.id)
        db.commit()
    return _serialize(a)


# ── Set default ───────────────────────────────────────────────────────────────
@router.patch("/{address_id}/default")
def set_default(address_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    a = db.query(ServiceAddress).filter(ServiceAddress.id == address_id).first()
    if not a or not a.is_active:
        raise HTTPException(404, "Endereço não encontrado.")
    if a.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied.")
    a.is_default = True
    db.commit()
    _clear_other_defaults(db, current.id, a.id)
    db.commit()
    return _serialize(a)


# ── Delete (soft) ─────────────────────────────────────────────────────────────
@router.delete("/{address_id}")
def delete_address(address_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    a = db.query(ServiceAddress).filter(ServiceAddress.id == address_id).first()
    if not a or not a.is_active:
        raise HTTPException(404, "Endereço não encontrado.")
    if a.user_id != current.id and current.role.value != "admin":
        raise HTTPException(403, "Access denied.")
    was_default = a.is_default
    a.is_active = False
    a.is_default = False
    db.commit()
    # Promote another active address to default if we just removed the default
    if was_default:
        next_def = db.query(ServiceAddress).filter(
            ServiceAddress.user_id == current.id,
            ServiceAddress.is_active == True,
        ).order_by(ServiceAddress.created_at.desc()).first()
        if next_def:
            next_def.is_default = True
            db.commit()
    return {"id": address_id, "deleted": True}