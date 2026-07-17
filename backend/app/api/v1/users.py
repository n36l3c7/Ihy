from fastapi import APIRouter, HTTPException, status

from app.api.deps import AdminUserDep, DbDep
from app.models.user import User, UserRole
from app.schemas.user import AdminUserCreate, UserRead, UserUpdate
from app.services import users as users_service
from app.services.users import DuplicateUserError

router = APIRouter()


def _get_user_or_404(db, user_id: int) -> User:
    user = users_service.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserRead])
def list_users(db: DbDep, _admin: AdminUserDep) -> list[User]:
    return users_service.list_all(db)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, db: DbDep, _admin: AdminUserDep) -> User:
    try:
        return users_service.create(
            db,
            username=payload.username,
            password=payload.password,
            email=payload.email,
            role=payload.role,
        )
    except DuplicateUserError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.get("/{user_id}", response_model=UserRead)
def read_user(user_id: int, db: DbDep, _admin: AdminUserDep) -> User:
    return _get_user_or_404(db, user_id)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, db: DbDep, _admin: AdminUserDep) -> User:
    user = _get_user_or_404(db, user_id)
    changes = payload.model_dump(exclude_unset=True)

    demoting = changes.get("role") == UserRole.USER and user.role == UserRole.ADMIN
    deactivating = changes.get("is_active") is False and user.is_active
    if (demoting or deactivating) and users_service.other_active_admins(db, user) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote or deactivate the last active admin",
        )

    try:
        return users_service.update(db, user, changes)
    except DuplicateUserError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: DbDep, admin: AdminUserDep) -> None:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account"
        )
    users_service.delete(db, user)
