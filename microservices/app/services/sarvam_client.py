"""Sarvam AI HTTP client — chat (30B), Bulbul TTS, Saaras STT."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import get_settings

LANGUAGE_MAP = {
    "en": "en-IN",
    "en-in": "en-IN",
    "english": "en-IN",
    "hi": "hi-IN",
    "hi-in": "hi-IN",
    "hindi": "hi-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "pa": "pa-IN",
    "od": "od-IN",
}


class SarvamError(RuntimeError):
    pass


def to_sarvam_language(code: str | None) -> str:
    if not code:
        return "en-IN"
    return LANGUAGE_MAP.get(code.strip().lower(), code if "-" in code else "en-IN")


class SarvamClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.sarvam_api_key or "").strip()
        self.base_url = settings.sarvam_base_url.rstrip("/")
        self.chat_model = settings.sarvam_chat_model
        self.tts_model = settings.sarvam_tts_model
        self.tts_speaker = settings.sarvam_tts_speaker
        self.stt_model = settings.sarvam_stt_model

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise SarvamError("SARVAM_API_KEY is not configured")
        return {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
        max_tokens: int = 2500,
        model: str | None = None,
    ) -> str:
        payload = {
            "model": model or self.chat_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=self._headers(),
                json=payload,
            )
        if response.status_code >= 400:
            raise SarvamError(f"Sarvam chat failed ({response.status_code}): {response.text}")
        data = response.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise SarvamError(f"Unexpected Sarvam chat response: {data}") from exc

    async def text_to_speech(
        self,
        text: str,
        *,
        language: str = "en",
        speaker: str | None = None,
    ) -> dict[str, Any]:
        """Return Bulbul TTS payload with base64 audio strings."""
        clipped = text.strip()
        if len(clipped) > 2400:
            clipped = clipped[:2400].rsplit(" ", 1)[0] + "…"

        payload = {
            "text": clipped,
            "target_language_code": to_sarvam_language(language),
            "language_code": to_sarvam_language(language),
            "speaker": speaker or self.tts_speaker,
            "model": self.tts_model,
            "pace": 1.0,
            "speech_sample_rate": 24000,
            "output_audio_codec": "wav",
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"{self.base_url}/text-to-speech",
                headers=self._headers(),
                json=payload,
            )
        if response.status_code >= 400:
            # Retry with only documented required fields if schema differs
            minimal = {
                "text": clipped,
                "language_code": to_sarvam_language(language),
                "speaker": speaker or self.tts_speaker,
                "model": self.tts_model,
            }
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{self.base_url}/text-to-speech",
                    headers=self._headers(),
                    json=minimal,
                )
        if response.status_code >= 400:
            raise SarvamError(f"Sarvam TTS failed ({response.status_code}): {response.text}")
        return response.json()

    async def speech_to_text(
        self,
        file_bytes: bytes,
        filename: str,
        *,
        language: str | None = None,
        mode: str = "transcribe",
    ) -> dict[str, Any]:
        if not self.api_key:
            raise SarvamError("SARVAM_API_KEY is not configured")

        data = {
            "model": self.stt_model,
            "mode": mode,
        }
        if language:
            data["language_code"] = to_sarvam_language(language)

        files = {"file": (filename, file_bytes, "application/octet-stream")}
        headers = {"api-subscription-key": self.api_key}

        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"{self.base_url}/speech-to-text",
                headers=headers,
                data=data,
                files=files,
            )
        if response.status_code >= 400:
            raise SarvamError(f"Sarvam STT failed ({response.status_code}): {response.text}")
        return response.json()


def extract_json_object(text: str) -> Any:
    """Best-effort JSON extraction from an LLM response."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise
