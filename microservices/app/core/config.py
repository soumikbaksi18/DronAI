from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "GuruDroneAI GenAI"
    environment: str = "development"
    genai_host: str = "0.0.0.0"
    genai_port: int = 8001
    openai_api_key: str | None = None
    sarvam_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
