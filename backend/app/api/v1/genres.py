from fastapi import APIRouter

from app.api.deps import CurrentUserDep, DbDep
from app.schemas.library import GenreWithCount
from app.services import catalog

router = APIRouter()


@router.get("", response_model=list[GenreWithCount])
def list_genres(db: DbDep, _user: CurrentUserDep) -> list[GenreWithCount]:
    result = []
    for genre, track_count in catalog.list_genres(db):
        data = GenreWithCount.model_validate(genre)
        data.track_count = track_count
        result.append(data)
    return result
