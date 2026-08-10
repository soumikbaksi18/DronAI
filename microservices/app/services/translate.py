"""Sarvam translation — runs between the script agent and TTS.

Only the spoken segments are translated; scripted pauses and unquoted
performance cues never reach the translator, so pause placement survives
translation untouched and timing is recomputed from the translated audio.
"""

import re

import httpx

from app.core.config import get_settings

settings = get_settings()

TRANSLATE_URL = "https://api.sarvam.ai/translate"
SOURCE_LANGUAGE = "en-IN"

# Verified against the API: TTS and sarvam-translate:v1 accept exactly this set.
LANGUAGES = {
    "en-IN": "English",
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
    "as-IN": "Assamese",
    "ur-IN": "Urdu",
    "sa-IN": "Sanskrit",
    "ne-IN": "Nepali",
    "sd-IN": "Sindhi",
    "ks-IN": "Kashmiri",
    "kok-IN": "Konkani",
    "mai-IN": "Maithili",
    "mni-IN": "Manipuri",
    "doi-IN": "Dogri",
    "brx-IN": "Bodo",
    "sat-IN": "Santali",
}

# mayura:v1 covers fewer languages and asks you to fall back to sarvam-translate.
MAYURA_LANGUAGES = {
    "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN",
    "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN",
}

MODELS = {"sarvam-translate": "sarvam-translate:v1", "mayura": "mayura:v1"}
STYLES = ("formal", "modern-colloquial", "classic-colloquial", "code-mixed")
CHAR_LIMITS = {"sarvam-translate:v1": 2000, "mayura:v1": 1000}

SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def resolve_model(name: str | None) -> str:
    return MODELS.get((name or "sarvam-translate").strip().lower(), MODELS["sarvam-translate"])


def _post(text: str, target: str, model: str, style: str | None, gender: str | None = None) -> str:
    if not settings.sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")

    body = {
        "input": text,
        "source_language_code": SOURCE_LANGUAGE,
        "target_language_code": target,
        "model": model,
    }
    if model == MODELS["mayura"] and style:
        body["mode"] = style  # style control is a Mayura feature
    if gender:
        # gendered languages inflect verbs for the speaker: without this a male
        # character says "मैं ... लाई" (feminine) in Hindi
        body["speaker_gender"] = gender

    response = httpx.post(
        TRANSLATE_URL,
        headers={"api-subscription-key": settings.sarvam_api_key},
        json=body,
        timeout=120,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Sarvam translate {response.status_code}: {response.text[:300]}")
    return response.json()["translated_text"]


def translate_text(
    text: str, target: str, model: str, style: str | None = None, gender: str | None = None
) -> str:
    """Translate one line, splitting on sentence boundaries if it exceeds the model limit."""
    limit = CHAR_LIMITS[model]
    if len(text) <= limit:
        return _post(text, target, model, style, gender)

    chunks, current = [], ""
    for sentence in SENTENCE_SPLIT.split(text):
        if len(current) + len(sentence) + 1 > limit and current:
            chunks.append(current.strip())
            current = ""
        current += sentence + " "
    if current.strip():
        chunks.append(current.strip())

    over = [c for c in chunks if len(c) > limit]
    if over:
        raise RuntimeError(f"A single sentence exceeds the {limit}-char limit of {model}")
    return " ".join(_post(chunk, target, model, style, gender) for chunk in chunks)


def translate_segments(
    segments: list[tuple[str, str | float]],
    target: str,
    model: str,
    style: str | None = None,
    gender: str | None = None,
) -> list[tuple[str, str | float]]:
    """Translate spoken segments in place, leaving pauses exactly where they were."""
    if target == SOURCE_LANGUAGE:
        return segments
    return [
        (kind, translate_text(str(value), target, model, style, gender)) if kind == "speech" else
        (kind, value)
        for kind, value in segments
    ]


def render_script(segments: list[tuple[str, str | float]]) -> str:
    """Human-readable script for the job payload, in the same shape the agent emits."""
    lines = []
    for kind, value in segments:
        lines.append(f"[pause: {value}s]" if kind == "pause" else f'"{value}"')
    return "\n".join(lines)


def demo() -> None:
    global _post
    real = _post
    calls: list[tuple[str, str, str, str | None]] = []

    def fake(text, target, model, style, gender=None):
        calls.append((text, target, model, style, gender))
        return f"<{target}>{text}"

    try:
        _post = fake
        segments = [("speech", "One."), ("pause", 1.0), ("speech", "Two.")]

        # pauses survive untouched, in position
        out = translate_segments(segments, "hi-IN", MODELS["sarvam-translate"])
        assert out == [("speech", "<hi-IN>One."), ("pause", 1.0), ("speech", "<hi-IN>Two.")], out
        assert len(calls) == 2, "pauses must never be sent to the translator"

        # English target is a no-op — no API call, same object
        calls.clear()
        assert translate_segments(segments, "en-IN", MODELS["mayura"]) is segments
        assert calls == []

        # style and speaker gender reach every chunk
        calls.clear()
        translate_segments(segments, "ta-IN", MODELS["mayura"], "modern-colloquial", "Male")
        assert all(call[3] == "modern-colloquial" and call[4] == "Male" for call in calls)

        # long input splits at sentence boundaries, and each chunk stays under the limit
        calls.clear()
        limit = CHAR_LIMITS[MODELS["mayura"]]
        long_text = " ".join(["This is a sentence."] * 120)
        assert len(long_text) > limit
        translate_text(long_text, "hi-IN", MODELS["mayura"])
        assert len(calls) > 1
        assert all(len(call[0]) <= limit for call in calls)

        try:
            translate_text("x" * (limit + 10), "hi-IN", MODELS["mayura"])
            raise AssertionError("an unsplittable sentence must fail loudly")
        except RuntimeError as exc:
            assert "exceeds" in str(exc)
    finally:
        _post = real

    assert resolve_model("mayura") == "mayura:v1"
    assert resolve_model(None) == "sarvam-translate:v1"
    assert resolve_model("nonsense") == "sarvam-translate:v1"
    assert MAYURA_LANGUAGES <= set(LANGUAGES)
    assert render_script([("speech", "Hi"), ("pause", 0.5)]) == '"Hi"\n[pause: 0.5s]'
    print("ok")


if __name__ == "__main__":
    demo()
