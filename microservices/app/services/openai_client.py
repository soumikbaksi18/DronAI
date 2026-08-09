"""Minimal OpenAI chat client used as LLM fallback for Classroom Director."""

from __future__ import annotations

import httpx

from app.core.config import get_settings


class OpenAIError(RuntimeError):
    pass


class OpenAIClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.openai_api_key or "").strip()
        self.model = settings.openai_chat_model
        self.base_url = "https://api.openai.com/v1"

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
        max_tokens: int = 2500,
        model: str | None = None,
    ) -> str:
        if not self.api_key:
            raise OpenAIError("OPENAI_API_KEY is not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
        if response.status_code >= 400:
            raise OpenAIError(f"OpenAI chat failed ({response.status_code}): {response.text}")
        data = response.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenAIError(f"Unexpected OpenAI response: {data}") from exc
