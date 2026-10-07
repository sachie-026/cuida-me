"""
Unit tests for admin permissions system.
Run: cd backend && python -m pytest tests/test_permissions.py -v
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

import pytest
from unittest.mock import MagicMock
from enum import Enum

from app.utils.admin_permissions import (
    ADMIN_PERMISSIONS,
    get_admin_permissions,
    require_admin_section,
    is_super_admin,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers: mock User objects
# ─────────────────────────────────────────────────────────────────────────────

class MockRole(Enum):
    admin = "admin"
    client = "client"
    nurse = "nurse"

def make_user(role="admin", admin_role=None):
    user = MagicMock()
    user.role = MockRole(role) if role in [r.value for r in MockRole] else MagicMock(value=role)
    if admin_role is not None:
        user.admin_role = admin_role
    else:
        # No admin_role attribute → super_admin by default
        user.admin_role = None
    return user


# ─────────────────────────────────────────────────────────────────────────────
# 1. Permission matrix structure
# ─────────────────────────────────────────────────────────────────────────────

class TestPermissionMatrix:
    def test_four_roles_defined(self):
        assert set(ADMIN_PERMISSIONS.keys()) == {"super_admin", "finance", "support", "operations"}

    def test_super_admin_has_all_sections(self):
        sa = set(ADMIN_PERMISSIONS["super_admin"])
        # Super admin should have every section that any other role has
        for role_perms in ADMIN_PERMISSIONS.values():
            for section in role_perms:
                assert section in sa, f"super_admin missing '{section}'"

    def test_finance_sections(self):
        assert "commission" in ADMIN_PERMISSIONS["finance"]
        assert "payments" in ADMIN_PERMISSIONS["finance"]
        assert "overview" in ADMIN_PERMISSIONS["finance"]

    def test_support_sections(self):
        assert "professionals" in ADMIN_PERMISSIONS["support"]
        assert "users" in ADMIN_PERMISSIONS["support"]
        assert "bookings" in ADMIN_PERMISSIONS["support"]

    def test_operations_sections(self):
        assert "holidays" in ADMIN_PERMISSIONS["operations"]
        assert "settings" in ADMIN_PERMISSIONS["operations"]
        assert "validation" in ADMIN_PERMISSIONS["operations"]

    def test_finance_cannot_access_admin_roles(self):
        assert "admin_roles" not in ADMIN_PERMISSIONS["finance"]

    def test_support_cannot_access_payments(self):
        assert "payments" not in ADMIN_PERMISSIONS["support"]

    def test_operations_cannot_access_admin_roles(self):
        assert "admin_roles" not in ADMIN_PERMISSIONS["operations"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. get_admin_permissions
# ─────────────────────────────────────────────────────────────────────────────

class TestGetAdminPermissions:
    def test_non_admin_returns_empty(self):
        user = make_user(role="client")
        assert get_admin_permissions(user) == []

    def test_admin_no_role_defaults_to_super(self):
        user = make_user(role="admin", admin_role=None)
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["super_admin"]

    def test_admin_super_admin(self):
        user = make_user(role="admin", admin_role="super_admin")
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["super_admin"]

    def test_admin_finance(self):
        user = make_user(role="admin", admin_role="finance")
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["finance"]

    def test_admin_support(self):
        user = make_user(role="admin", admin_role="support")
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["support"]

    def test_admin_operations(self):
        user = make_user(role="admin", admin_role="operations")
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["operations"]

    def test_unknown_admin_role_defaults_to_super(self):
        user = make_user(role="admin", admin_role="unknown_role")
        perms = get_admin_permissions(user)
        assert perms == ADMIN_PERMISSIONS["super_admin"]

    def test_nurse_returns_empty(self):
        user = make_user(role="nurse")
        assert get_admin_permissions(user) == []


# ─────────────────────────────────────────────────────────────────────────────
# 3. require_admin_section (dependency factory)
# ─────────────────────────────────────────────────────────────────────────────

class TestRequireAdminSection:
    def test_returns_callable(self):
        checker = require_admin_section("overview")
        assert callable(checker)

    def test_non_admin_raises_403(self):
        from fastapi import HTTPException
        checker = require_admin_section("overview")
        user = make_user(role="client")
        with pytest.raises(HTTPException) as exc_info:
            checker(current=user)
        assert exc_info.value.status_code == 403
        assert "Admin access required" in str(exc_info.value.detail)

    def test_admin_with_access_passes(self):
        checker = require_admin_section("overview")
        user = make_user(role="admin", admin_role="finance")
        # finance has "overview" access
        result = checker(current=user)
        assert result == user

    def test_admin_without_section_raises_403(self):
        from fastapi import HTTPException
        checker = require_admin_section("admin_roles")
        user = make_user(role="admin", admin_role="finance")
        # finance does NOT have "admin_roles"
        with pytest.raises(HTTPException) as exc_info:
            checker(current=user)
        assert exc_info.value.status_code == 403

    def test_super_admin_has_all_sections(self):
        user = make_user(role="admin", admin_role="super_admin")
        for section in ADMIN_PERMISSIONS["super_admin"]:
            checker = require_admin_section(section)
            result = checker(current=user)
            assert result == user


# ─────────────────────────────────────────────────────────────────────────────
# 4. is_super_admin
# ─────────────────────────────────────────────────────────────────────────────

class TestIsSuperAdmin:
    def test_non_admin_raises(self):
        from fastapi import HTTPException
        user = make_user(role="client")
        with pytest.raises(HTTPException) as exc_info:
            is_super_admin(current=user)
        assert exc_info.value.status_code == 403

    def test_admin_not_super_raises(self):
        from fastapi import HTTPException
        user = make_user(role="admin", admin_role="finance")
        with pytest.raises(HTTPException) as exc_info:
            is_super_admin(current=user)
        assert exc_info.value.status_code == 403
        assert "Super Admin" in str(exc_info.value.detail)

    def test_super_admin_passes(self):
        user = make_user(role="admin", admin_role="super_admin")
        result = is_super_admin(current=user)
        assert result == user

    def test_admin_no_role_defaults_super(self):
        """No admin_role attribute → defaults to super_admin → passes."""
        user = make_user(role="admin", admin_role=None)
        result = is_super_admin(current=user)
        assert result == user