"""Generate PPT-style presentation pages (paragraphs + images) for lesson scenes."""

from __future__ import annotations

import base64
import logging
import re
from uuid import UUID

import httpx

from app.core.config import get_settings
from app.models.schemas import PresentationPage, Scene, SceneMediaKind
from app.services.lesson_files import lesson_dir
from app.services.llm import LLMError, chat_completion, extract_json_object

logger = logging.getLogger(__name__)

# Schema-echo / empty prompts that previously made the image model invent random textbook art.
_BAD_IMAGE_PROMPT_RE = re.compile(
    r"(detailed educational illustration prompt|"
    r"image_prompt|"
    r"^no text in image$|"
    r"clean textbook-appropriate illustration)",
    re.IGNORECASE,
)


async def generate_presentation_pages(
    *,
    lesson_id: UUID,
    lesson_title: str,
    scenes: list[Scene],
    subject: str | None = None,
    language: str = "en",
    only_presentation_scenes: bool = True,
) -> list[PresentationPage]:
    """Build presentation pages for scenes.

    By default only `media_kind=presentation` scenes get full pages + images.
    Video-tagged scenes get a short text placeholder (video page comes later).
    """
    if not scenes:
        raise ValueError("No scenes to generate presentations from.")

    settings = get_settings()
    if not settings.has_openai and not settings.has_sarvam:
        raise LLMError("Set OPENAI_API_KEY (or SARVAM_API_KEY) in backend/.env to generate presentations.")
    if not settings.has_openai:
        raise LLMError(
            "OPENAI_API_KEY is required in backend/.env for presentation images "
            "(set OPENAI_IMAGE_MODEL=gpt-image-1.5)."
        )

    pages: list[PresentationPage] = []
    for scene in scenes:
        if only_presentation_scenes and scene.media_kind == SceneMediaKind.VIDEO:
            pages.append(
                PresentationPage(
                    scene_id=scene.id,
                    title=scene.title,
                    headline=scene.title,
                    paragraphs=[
                        "This scene is tagged for video. Presentation layout is skipped here — "
                        "generate the video on the Video generation page next."
                    ],
                    image_prompt=None,
                    image_url=None,
                    media_kind=SceneMediaKind.VIDEO,
                    status="skipped_video",
                )
            )
            continue

        try:
            page = await _generate_page_content(
                lesson_title=lesson_title,
                scene=scene,
                subject=subject,
                language=language,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Presentation text failed for %s: %s", scene.id, exc)
            page = PresentationPage(
                scene_id=scene.id,
                title=scene.title,
                headline=scene.slide.headline if scene.slide else scene.title,
                paragraphs=_fallback_paragraphs(scene),
                image_prompt=None,
                media_kind=scene.media_kind,
                status="text_only",
            )

        # Always ground the image in lesson/scene text — never trust freestyle LLM image prompts
        # (they often echoed the JSON schema and produced off-topic anatomy diagrams).
        image_prompt = _grounded_image_prompt(
            lesson_title=lesson_title,
            subject=subject,
            scene=scene,
            headline=page.headline,
            paragraphs=page.paragraphs,
            llm_hint=page.image_prompt,
        )
        page.image_prompt = image_prompt
        try:
            image_url = await _generate_and_save_image(
                lesson_id=lesson_id,
                scene_id=scene.id,
                prompt=image_prompt,
            )
            page.image_url = image_url
            page.status = "ready"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Image generation failed for %s: %s", scene.id, exc)
            page.status = "text_only"

        pages.append(page)

    return pages


async def _generate_page_content(
    *,
    lesson_title: str,
    scene: Scene,
    subject: str | None,
    language: str,
) -> PresentationPage:
    bullets = scene.slide.bullets if scene.slide else []
    system = (
        "You write beautiful classroom presentation pages for Indian school students. "
        "Return ONLY JSON (no fences):\n"
        '{"headline":"...","paragraphs":["2-4 short rich paragraphs"],'
        '"image_hint":"one short phrase naming the exact scene to draw from the source text"}\n'
        "Rules:\n"
        "- Paragraphs should feel like elegant slide body copy, not bullet dumps\n"
        "- Stay faithful to the scene content and source; do not invent facts or new topics\n"
        f"- Write paragraphs in language '{language}'\n"
        "- image_hint must name people/places/events from THIS scene only "
        "(e.g. 'storming of the Bastille in 1789'). Never invent biology, anatomy, "
        "or unrelated textbook diagrams. Leave image_hint empty if unsure."
    )
    user = (
        f"Lesson: {lesson_title}\n"
        f"Subject: {subject or 'General'}\n"
        f"Scene title: {scene.title}\n"
        f"Slide headline: {(scene.slide.headline if scene.slide else scene.title)}\n"
        f"Bullets: {bullets}\n"
        f"Narration: {scene.narration}\n"
        f"Visual hint from planner: {scene.visual_prompt or ''}\n"
    )
    content, _provider = await chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.35,
        max_tokens=1200,
    )
    parsed = extract_json_object(content)
    if not isinstance(parsed, dict):
        raise LLMError("Presentation LLM did not return an object")

    paragraphs = [str(p).strip() for p in (parsed.get("paragraphs") or []) if str(p).strip()]
    if not paragraphs:
        paragraphs = _fallback_paragraphs(scene)
    headline = str(parsed.get("headline") or (scene.slide.headline if scene.slide else scene.title)).strip()
    # Prefer new key; accept legacy image_prompt if model still returns it
    image_hint = str(
        parsed.get("image_hint") or parsed.get("image_prompt") or ""
    ).strip() or None
    if image_hint and not _is_usable_image_hint(image_hint):
        image_hint = None

    return PresentationPage(
        scene_id=scene.id,
        title=scene.title,
        headline=headline,
        paragraphs=paragraphs[:4],
        image_prompt=image_hint,
        media_kind=scene.media_kind,
        status="text_only",
    )


def _is_usable_image_hint(hint: str) -> bool:
    text = hint.strip()
    if len(text) < 12:
        return False
    if _BAD_IMAGE_PROMPT_RE.search(text):
        return False
    # Reject schema-ish stubs with no concrete nouns beyond boilerplate
    lowered = text.lower()
    if lowered in {
        "no text in image",
        "educational illustration",
        "textbook illustration",
        "classroom illustration",
    }:
        return False
    return True


def _grounded_image_prompt(
    *,
    lesson_title: str,
    subject: str | None,
    scene: Scene,
    headline: str,
    paragraphs: list[str],
    llm_hint: str | None,
) -> str:
    """Build an image prompt strictly from lesson/scene text so the model cannot wander."""
    bullets = scene.slide.bullets if scene.slide else []
    facts = "; ".join(bullets[:4]) if bullets else ""
    body = " ".join(paragraphs[:2]).strip()
    if len(body) > 320:
        body = body[:317].rstrip() + "…"
    narration = (scene.narration or "").strip()
    if len(narration) > 280:
        narration = narration[:277].rstrip() + "…"
    visual = (scene.visual_prompt or "").strip()
    hint = (llm_hint or "").strip() if llm_hint and _is_usable_image_hint(llm_hint) else ""

    subject_bit = subject or "General"
    parts = [
        f"Create one educational illustration for a {subject_bit} classroom slide.",
        f"Lesson title: {lesson_title}.",
        f"Slide title: {scene.title}.",
        f"Headline: {headline}.",
    ]
    if facts:
        parts.append(f"Facts from the PDF/source only: {facts}.")
    if body:
        parts.append(f"Slide copy: {body}")
    if narration:
        parts.append(f"Teacher narration context: {narration}")
    if visual:
        parts.append(f"Visual direction grounded in the source: {visual}")
    if hint:
        parts.append(f"Depict this exact moment/idea: {hint}")
    parts.append(
        "STRICT: Illustrate ONLY people, places, events, and ideas named above. "
        "Do not invent a different school subject. "
        "Never draw human anatomy, digestive organs, nervous systems, cells, plant biology, "
        "or generic science diagrams unless those topics appear explicitly in the source text above. "
        "No captions, labels, logos, or watermarks."
    )
    return " ".join(parts)


def _fallback_paragraphs(scene: Scene) -> list[str]:
    bullets = scene.slide.bullets if scene.slide else []
    paras = []
    if scene.narration:
        paras.append(scene.narration.strip())
    if bullets:
        paras.append("Key ideas: " + "; ".join(bullets[:4]) + ".")
    return paras or [scene.title]


def _image_payload(model: str, size: str, prompt: str) -> dict:
    """Build the Images API body. GPT Image models reject dall-e-only fields."""
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }
    if model.startswith("gpt-image"):
        payload["quality"] = "medium"
        payload["output_format"] = "png"
    else:
        # dall-e-2 / dall-e-3
        payload["response_format"] = "b64_json"
        if model.startswith("dall-e-3"):
            payload["quality"] = "standard"
    return payload


async def _generate_and_save_image(*, lesson_id: UUID, scene_id: str, prompt: str) -> str:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        raise LLMError("OPENAI_API_KEY required for image generation")

    # Keep topical grounding first; style instructions last and short.
    safe_prompt = (
        f"{prompt[:1400]} "
        "Style: clean educational textbook illustration, soft natural lighting, "
        "no text, no watermark, no logos."
    )
    model = settings.openai_image_model
    payload = _image_payload(model, settings.openai_image_size, safe_prompt)

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise LLMError(f"OpenAI image failed ({response.status_code}): {response.text[:500]}")

    data = response.json()
    item = (data.get("data") or [{}])[0]
    b64 = item.get("b64_json")
    if b64:
        image_bytes = base64.b64decode(b64)
    else:
        url = item.get("url")
        if not url:
            raise LLMError("No image data in OpenAI response")
        async with httpx.AsyncClient(timeout=120.0) as client:
            img_resp = await client.get(url)
        if img_resp.status_code >= 400:
            raise LLMError("Failed to download generated image")
        image_bytes = img_resp.content

    images_dir = lesson_dir(lesson_id) / "presentations"
    images_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{scene_id}.png"
    path = images_dir / filename
    path.write_bytes(image_bytes)
    logger.info("Saved OpenAI image for %s via %s (%s bytes)", scene_id, model, len(image_bytes))

    return f"/uploads/{lesson_id}/presentations/{filename}"
