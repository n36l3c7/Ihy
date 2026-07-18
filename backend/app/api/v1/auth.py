from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUserDep, DbDep
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User, UserRole
from app.schemas.auth import RefreshRequest, SetupStatus, TokenPair
from app.schemas.user import UserCreate, UserRead
from app.services import users as users_service

router = APIRouter()

_INVALID_TOKEN_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired refresh token",
    headers={"WWW-Authenticate": "Bearer"},
)


def _token_pair(user: User) -> TokenPair:
    subject = str(user.id)
    return TokenPair(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.get("/setup", response_model=SetupStatus)
def setup_status(db: DbDep) -> SetupStatus:
    """Whether the instance still needs its first admin account."""
    return SetupStatus(needs_setup=users_service.count(db) == 0)


@router.post("/setup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_first_admin(payload: UserCreate, db: DbDep) -> User:
    """Create the first admin account. Only available while no users exist."""
    if users_service.count(db) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Setup has already been completed"
        )
    return users_service.create(
        db,
        username=payload.username,
        password=payload.password,
        email=payload.email,
        role=UserRole.ADMIN,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )


@router.post("/login", response_model=TokenPair)
def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbDep) -> TokenPair:
    user = users_service.authenticate(db, form_data.username, form_data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: DbDep) -> TokenPair:
    try:
        data = decode_token(payload.refresh_token)
    except jwt.InvalidTokenError:
        raise _INVALID_TOKEN_EXCEPTION from None
    if data.get("type") != "refresh":
        raise _INVALID_TOKEN_EXCEPTION
    try:
        user_id = int(data["sub"])
    except (KeyError, TypeError, ValueError):
        raise _INVALID_TOKEN_EXCEPTION from None
    user = users_service.get(db, user_id)
    if user is None or not user.is_active:
        raise _INVALID_TOKEN_EXCEPTION
    return _token_pair(user)


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: CurrentUserDep) -> User:
    return current_user
