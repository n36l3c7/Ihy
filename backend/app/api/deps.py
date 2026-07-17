from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

DbDep = Annotated[Session, Depends(get_db)]

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbDep) -> User:
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


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def require_admin(current_user: CurrentUserDep) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return current_user


AdminUserDep = Annotated[User, Depends(require_admin)]
