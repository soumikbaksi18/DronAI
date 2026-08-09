from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_SERVICE_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "GuruDroneAI GenAI"
    environment: str = "development"
    genai_host: str = "0.0.0.0"
    genai_port: int = 8001

    openai_api_key: str | None = None
    openai_chat_model: str = "gpt-4o-mini"

    sarvam_api_key: str | None = None
    sarvam_base_url: str = "https://api.sarvam.ai"
    sarvam_chat_model: str = "sarvam-30b"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_speaker: str = "shubh"
    sarvam_stt_model: str = "saaras:v3"

    @property
    def has_sarvam(self) -> bool:
        key = (self.sarvam_api_key or "").strip()
        # OpenAI project keys look like sk-proj-... and will never authenticate to Sarvam.
        if not key or key.startswith("sk-proj-"):
            return False
        return True

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key and self.openai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
