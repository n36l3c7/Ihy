from fastapi import APIRouter

from app.api.v1 import (
    albums,
    artists,
    auth,
    favorites,
    genres,
    history,
    library,
    playlists,
    sources,
    tracks,
    users,
)
from app.core.config import get_settings

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(tracks.router, prefix="/tracks", tags=["tracks"])
api_router.include_router(artists.router, prefix="/artists", tags=["artists"])
api_router.include_router(albums.router, prefix="/albums", tags=["albums"])
api_router.include_router(genres.router, prefix="/genres", tags=["genres"])
api_router.include_router(favorites.router, prefix="/favorites", tags=["favorites"])
api_router.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
api_router.include_router(history.router, prefix="/history", tags=["history"])


@api_router.get("/health")
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name, "version": settings.version}
