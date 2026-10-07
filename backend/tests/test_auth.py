"""
Unit tests for auth/security utilities (JWT, password hashing).
Run: cd backend && python -m pytest tests/test_auth.py -v
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Must set env vars BEFORE importing app modules
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

import pytest
import jwt
from datetime import datetime, timedelta

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    pwd_context,
)
from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# 1. Password hashing
# ─────────────────────────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_returns_bcrypt_string(self):
        hashed = hash_password("mypassword123")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_hash_is_not_plaintext(self):
        hashed = hash_password("mypassword123")
        assert hashed != "mypassword123"

    def test_verify_correct_password(self):
        hashed = hash_password("senhasegura")
        assert verify_password("senhasegura", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("senhasegura")
        assert verify_password("senhaerrada", hashed) is False

    def test_different_hashes_for_same_password(self):
        """bcrypt salts should produce different hashes."""
        h1 = hash_password("password")
        h2 = hash_password("password")
        assert h1 != h2
        # But both verify
        assert verify_password("password", h1) is True
        assert verify_password("password", h2) is True

    def test_password_truncated_at_72_chars(self):
        """bcrypt max is 72 bytes — code truncates at 72 chars."""
        long_pw = "a" * 100
        hashed = hash_password(long_pw)
        # Verifying with 72-char version should also work
        assert verify_password("a" * 100, hashed) is True
        # Verifying with 72 chars should also pass (same truncation)
        assert verify_password("a" * 72, hashed) is True

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("x", hashed) is False

    def test_unicode_password(self):
        hashed = hash_password("café☕️")
        assert verify_password("café☕️", hashed) is True
        assert verify_password("cafe", hashed) is False


# ─────────────────────────────────────────────────────────────────────────────
# 2. JWT token creation
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token({"sub": "user-123"})
        assert isinstance(token, str)
        assert len(token) > 20

    def test_token_contains_subject(self):
        token = create_access_token({"sub": "user-456"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == "user-456"

    def test_token_contains_expiry(self):
        token = create_access_token({"sub": "user-789"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert "exp" in payload

    def test_expiry_is_in_future(self):
        token = create_access_token({"sub": "user-abc"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = datetime.utcfromtimestamp(payload["exp"])
        assert exp > datetime.utcnow()

    def test_preserves_extra_data(self):
        token = create_access_token({"sub": "u1", "role": "nurse", "extra": 42})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["role"] == "nurse"
        assert payload["extra"] == 42

    def test_does_not_mutate_input(self):
        data = {"sub": "user-xyz"}
        create_access_token(data)
        assert "exp" not in data  # Original dict unchanged


# ─────────────────────────────────────────────────────────────────────────────
# 3. JWT token decoding
# ─────────────────────────────────────────────────────────────────────────────

class TestDecodeToken:
    def test_decode_valid_token(self):
        token = create_access_token({"sub": "user-100"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-100"

    def test_decode_invalid_token(self):
        assert decode_token("not-a-valid-token") is None

    def test_decode_tampered_token(self):
        token = create_access_token({"sub": "user-200"})
        # Tamper with the token
        tampered = token[:-5] + "XXXXX"
        assert decode_token(tampered) is None

    def test_decode_wrong_secret(self):
        # Create token with our secret, try to decode with wrong one
        token = jwt.encode(
            {"sub": "user-300", "exp": datetime.utcnow() + timedelta(hours=1)},
            "wrong-secret",
            algorithm="HS256",
        )
        # Our decode_token uses settings.SECRET_KEY which is different
        assert decode_token(token) is None

    def test_decode_expired_token(self):
        # Create a token that's already expired
        token = jwt.encode(
            {"sub": "user-400", "exp": datetime.utcnow() - timedelta(hours=1)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        assert decode_token(token) is None

    def test_roundtrip(self):
        """Create → decode should return same data."""
        original = {"sub": "user-500", "role": "client"}
        token = create_access_token(original)
        decoded = decode_token(token)
        assert decoded["sub"] == "user-500"
        assert decoded["role"] == "client"