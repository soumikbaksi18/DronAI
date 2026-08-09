from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # repo-root .env first, service-local .env wins if present
    model_config = SettingsConfigDict(
        env_file=(Path(__file__).parents[3] / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "GuruDroneAI GenAI"
    environment: str = "development"
    genai_host: str = "0.0.0.0"
    genai_port: int = 8001
    openai_api_key: str | None = None
    sarvam_api_key: str | None = None
    sora_model: str = "sora-2"
    script_model: str = "gpt-4o-mini"
    video_output_dir: str = "outputs"
    video_upload_dir: str = "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
