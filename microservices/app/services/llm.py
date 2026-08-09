"""Provider-agnostic chat helper: Sarvam first, then OpenAI."""

from __future__ import annotations

from app.core.config import get_settings
from app.services.openai_client import OpenAIClient, OpenAIError
from app.services.sarvam_client import SarvamClient, SarvamError


class LLMError(RuntimeError):
    pass


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.3,
    max_tokens: int = 2500,
) -> tuple[str, str]:
    """Return (content, provider_name)."""
    settings = get_settings()
    errors: list[str] = []

    if settings.has_sarvam:
        try:
            content = await SarvamClient().chat(
                messages, temperature=temperature, max_tokens=max_tokens
            )
            return content, "sarvam"
        except SarvamError as exc:
            errors.append(str(exc))

    if settings.has_openai:
        try:
            content = await OpenAIClient().chat(
                messages, temperature=temperature, max_tokens=max_tokens
            )
            return content, "openai"
        except OpenAIError as exc:
            errors.append(str(exc))

    detail = " | ".join(errors) if errors else "No LLM provider configured"
    raise LLMError(detail)


def provider_status() -> dict[str, bool | str]:
    settings = get_settings()
    return {
        "sarvam": settings.has_sarvam,
        "openai": settings.has_openai,
        "preferred_chat": (
            "sarvam"
            if settings.has_sarvam
            else "openai"
            if settings.has_openai
            else "heuristic"
        ),
        "sarvam_chat_model": settings.sarvam_chat_model,
        "openai_chat_model": settings.openai_chat_model,
    }
