"""
50c: Admin Role-Based Permissions
==================================
Four admin sub-roles with different access levels.
Super Admin has full access. Others have scoped access.
Existing require_admin check is NOT modified — this layers on top.
"""
from fastapi import Depends, HTTPException
from app.core.auth_deps import get_current_user
from app.models.models import User

# Permission matrix: role → list of allowed sections
ADMIN_PERMISSIONS = {
    "super_admin": [
        "overview", "professionals", "users", "bookings", "commission",
        "holidays", "reports", "alice", "validation", "settings",
        "admin_roles", "payments", "observability",
    ],
    "finance": [
        "overview", "bookings", "commission", "payments",
    ],
    "support": [
        "overview", "professionals", "users", "bookings", "reports",
        "alice", "validation",
    ],
    "operations": [
        "overview", "professionals", "bookings", "holidays",
        "settings", "validation", "observability",
    ],
}

# Default: super_admin if no admin_role set (backwards compatible)
def get_admin_permissions(user: User) -> list:
    if user.role.value != "admin":
        return []
    admin_role = getattr(user, 'admin_role', None) or "super_admin"
    return ADMIN_PERMISSIONS.get(admin_role, ADMIN_PERMISSIONS["super_admin"])

def require_admin_section(section: str):
    """Dependency: check if admin has access to a specific section."""
    def checker(current: User = Depends(get_current_user)):
        if current.role.value != "admin":
            raise HTTPException(403, "Admin access required")
        permissions = get_admin_permissions(current)
        if section not in permissions:
            raise HTTPException(403, f"Seu perfil de admin ({getattr(current, 'admin_role', 'super_admin')}) não tem acesso a '{section}'.")
        return current
    return checker

def is_super_admin(current: User = Depends(get_current_user)):
    """Only super_admin can manage other admin roles."""
    if current.role.value != "admin":
        raise HTTPException(403, "Admin access required")
    admin_role = getattr(current, 'admin_role', None) or "super_admin"
    if admin_role != "super_admin":
        raise HTTPException(403, "Apenas Super Admin pode gerenciar permissões.")
    return current