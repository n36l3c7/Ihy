from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from app.api.subsonic import SubsonicError, subsonic_exception_handler
from app.api.subsonic import router as subsonic_router
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.workers.scheduler import shutdown_scheduler, start_scheduler


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    if get_settings().enable_scheduler:
        start_scheduler()
        yield
        shutdown_scheduler()
    else:
        yield


class SpaStaticFiles(StaticFiles):
    """Static file server with SPA fallback: unknown paths serve index.html
    so client-side routes survive a page refresh."""

    async def get_response(self, path: str, scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.version, lifespan=_lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")
    # Subsonic-compatible API for third-party mobile clients
    app.include_router(subsonic_router, prefix="/rest")
    app.add_exception_handler(SubsonicError, subsonic_exception_handler)

    # Serve the built frontend when available (production / Docker image)
    if settings.static_dir and settings.static_dir.is_dir():
        app.mount("/", SpaStaticFiles(directory=settings.static_dir, html=True), name="frontend")

    return app


app = create_app()
