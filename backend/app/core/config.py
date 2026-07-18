from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, overridable via environment variables with the IHY_ prefix."""

    model_config = SettingsConfigDict(env_prefix="IHY_", env_file=".env", extra="ignore")

    app_name: str = "Ihy"
    version: str = "1.0.0"
    debug: bool = False

    # Storage
    data_dir: Path = Path("./data")
    static_dir: Path | None = None  # built frontend assets, set in the Docker image

    # Database (empty = SQLite file inside data_dir)
    database_url: str = ""

    # Security
    # Must be at least 32 bytes for HS256; always override in production
    secret_key: str = "insecure-dev-only-secret-key-change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Background jobs (disabled in tests)
    enable_scheduler: bool = True

    # spotdl executable; kept in its own environment because its
    # dependencies conflict with the API's (fastapi pin)
    spotdl_command: str = "spotdl"

    # Development
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.data_dir / 'ihy.db'}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
