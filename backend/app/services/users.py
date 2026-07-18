from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole

# Verified against when the username does not exist, so login timing
# does not reveal whether an account exists.
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-constant-timing")


class DuplicateUserError(Exception):
    def __init__(self, field: str):
        self.field = field
        super().__init__(f"A user with this {field} already exists")


def get(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def list_all(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)))


def count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User)) or 0


def create(
    db: Session,
    *,
    username: str,
    password: str,
    email: str | None = None,
    role: UserRole = UserRole.USER,
    first_name: str | None = None,
    last_name: str | None = None,
) -> User:
    if get_by_username(db, username) is not None:
        raise DuplicateUserError("username")
    if email is not None and db.scalar(select(User).where(User.email == email)) is not None:
        raise DuplicateUserError("email")
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role=role,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, username: str, password: str) -> User | None:
    """Return the user when credentials are valid and the account is active."""
    user = get_by_username(db, username)
    if user is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return None
    if not verify_password(password, user.password_hash) or not user.is_active:
        return None
    return user


def update(db: Session, user: User, changes: dict[str, Any]) -> User:
    new_email = changes.get("email")
    if (
        new_email is not None
        and new_email != user.email
        and db.scalar(select(User).where(User.email == new_email)) is not None
    ):
        raise DuplicateUserError("email")

    password = changes.pop("password", None)
    if password is not None:
        user.password_hash = hash_password(password)
    for field in ("email", "role", "is_active", "first_name", "last_name"):
        if field in changes:
            setattr(user, field, changes[field])
    db.commit()
    db.refresh(user)
    return user


def delete(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()


def other_active_admins(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True), User.id != user.id)
        )
        or 0
    )
