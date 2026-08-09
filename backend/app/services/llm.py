"""Provider-agnostic chat helper for the backend: Sarvam 30B first, then OpenAI."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import get_settings


class LLMError(RuntimeError):
    pass


def extract_json_object(text: str) -> Any:
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


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.35,
    max_tokens: int = 3500,
) -> tuple[str, str]:
    """Return (content, provider_name)."""
    settings = get_settings()
    errors: list[str] = []

    if settings.has_sarvam:
        try:
            return await _sarvam_chat(messages, temperature=temperature, max_tokens=max_tokens), "sarvam"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"sarvam: {exc}")

    if settings.has_openai:
        try:
            return await _openai_chat(messages, temperature=temperature, max_tokens=max_tokens), "openai"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"openai: {exc}")

    detail = " | ".join(errors) if errors else "No LLM provider configured (set SARVAM_API_KEY or OPENAI_API_KEY)"
    raise LLMError(detail)


async def _sarvam_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float,
    max_tokens: int,
) -> str:
    settings = get_settings()
    headers = {
        "api-subscription-key": (settings.sarvam_api_key or "").strip(),
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.sarvam_chat_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{settings.sarvam_base_url.rstrip('/')}/v1/chat/completions",
            headers=headers,
            json=payload,
        )
    if response.status_code >= 400:
        raise LLMError(f"Sarvam chat failed ({response.status_code}): {response.text}")
    data = response.json()
    return data["choices"][0]["message"]["content"]


async def _openai_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float,
    max_tokens: int,
) -> str:
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {(settings.openai_api_key or '').strip()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_chat_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )
    if response.status_code >= 400:
        raise LLMError(f"OpenAI chat failed ({response.status_code}): {response.text}")
    data = response.json()
    return data["choices"][0]["message"]["content"]
