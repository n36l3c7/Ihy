from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
_oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

DbDep = Annotated[Session, Depends(get_db)]

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _load_user_from_access_token(token: str, db: Session) -> User:
    try:
        payload = decode_token(token)
    except jwt.InvalidTokenError:
        raise _CREDENTIALS_EXCEPTION from None
    if payload.get("type") != "access":
        raise _CREDENTIALS_EXCEPTION
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _CREDENTIALS_EXCEPTION from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXCEPTION
    return user


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbDep) -> User:
    return _load_user_from_access_token(token, db)


def get_current_user_allow_query_token(
    db: DbDep,
    bearer: Annotated[str | None, Depends(_oauth2_scheme_optional)] = None,
    token: Annotated[str | None, Query(description="Access token for <audio>/<img> URLs")] = None,
) -> User:
    """Media endpoints: browsers cannot set headers on <audio>/<img> src requests,
    so the access token is also accepted as a query parameter."""
    raw = bearer if bearer is not None else token
    if raw is None:
        raise _CREDENTIALS_EXCEPTION
    return _load_user_from_access_token(raw, db)


CurrentUserDep = Annotated[User, Depends(get_current_user)]
MediaUserDep = Annotated[User, Depends(get_current_user_allow_query_token)]


def require_admin(current_user: CurrentUserDep) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return current_user


AdminUserDep = Annotated[User, Depends(require_admin)]
