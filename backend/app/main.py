from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from app.api.v1.router import api_router
from app.core.config import get_settings


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
    app = FastAPI(title=settings.app_name, version=settings.version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")

    # Serve the built frontend when available (production / Docker image)
    if settings.static_dir and settings.static_dir.is_dir():
        app.mount("/", SpaStaticFiles(directory=settings.static_dir, html=True), name="frontend")

    return app


app = create_app()
