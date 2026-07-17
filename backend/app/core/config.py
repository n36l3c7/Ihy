from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, overridable via environment variables with the IHY_ prefix."""

    model_config = SettingsConfigDict(env_prefix="IHY_", env_file=".env", extra="ignore")

    app_name: str = "Ihy"
    version: str = "0.1.0"
    debug: bool = False

    # Storage
    data_dir: Path = Path("./data")
    static_dir: Path | None = None  # built frontend assets, set in the Docker image

    # Database (empty = SQLite file inside data_dir)
    database_url: str = ""

    # Security
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

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
