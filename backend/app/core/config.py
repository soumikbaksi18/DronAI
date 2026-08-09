from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_SERVICE_ROOT / ".env"), str(_REPO_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "GuruDroneAI Backend"
    environment: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    genai_service_url: str = "http://localhost:8001"
    cors_origins: str = "http://localhost:3000"
    upload_dir: str = "uploads"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
