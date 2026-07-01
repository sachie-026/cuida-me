"""
Auth dependencies for FastAPI routes.
Usage:
    from app.core.auth_deps import get_current_user, require_admin, require_professional

    @router.get("/something")
    def my_route(user = Depends(get_current_user)):
        ...

    @router.get("/admin-only")
    def admin_route(user = Depends(require_admin)):
        ...
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User, UserRole

security = HTTPBearer(auto_error=False)

PRO_ROLES = {UserRole.nurse, UserRole.technician, UserRole.nursing_assistant, UserRole.caregiver}

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Verify JWT and return the current user. Raises 401 if missing/invalid."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    """Only admins can access."""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user

def require_professional(user: User = Depends(get_current_user)) -> User:
    """Only professionals (nurse/technician/caregiver) can access."""
    if user.role not in PRO_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Professional access required")
    return user

def require_client(user: User = Depends(get_current_user)) -> User:
    """Only clients can access."""
    if user.role != UserRole.client:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client access required")
    return user

def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns user if authenticated, None if not. For public-but-enhanced endpoints."""
    if not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None