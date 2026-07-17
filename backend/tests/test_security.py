from datetime import timedelta

import jwt
import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_verify_password_with_invalid_hash() -> None:
    assert not verify_password("anything", "not-a-valid-argon2-hash")


def test_access_token_roundtrip() -> None:
    token = create_access_token("42")
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_refresh_token_roundtrip() -> None:
    token = create_refresh_token("42")
    payload = decode_token(token)
    assert payload["type"] == "refresh"


def test_expired_token_rejected() -> None:
    token = create_access_token("42", expires_delta=timedelta(seconds=-1))
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(token)


def test_tampered_token_rejected() -> None:
    token = create_access_token("42")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token + "tampered")
