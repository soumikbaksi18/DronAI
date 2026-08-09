"""Generate PPT-style presentation pages (paragraphs + images) for lesson scenes."""

from __future__ import annotations

import base64
import logging
from uuid import UUID

import httpx

from app.core.config import get_settings
from app.models.schemas import PresentationPage, Scene, SceneMediaKind
from app.services.lesson_files import lesson_dir
from app.services.llm import LLMError, chat_completion, extract_json_object

logger = logging.getLogger(__name__)


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
                image_prompt=scene.visual_prompt,
                media_kind=scene.media_kind,
                status="text_only",
            )

        if page.image_prompt and settings.has_openai:
            try:
                image_url = await _generate_and_save_image(
                    lesson_id=lesson_id,
                    scene_id=scene.id,
                    prompt=page.image_prompt,
                )
                page.image_url = image_url
                page.status = "ready"
            except Exception as exc:  # noqa: BLE001
                logger.warning("Image generation failed for %s: %s", scene.id, exc)
                page.status = "text_only"
        else:
            page.status = "text_only" if not page.image_url else page.status

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
        '"image_prompt":"detailed educational illustration prompt, no text in image"}\n'
        "Rules:\n"
        "- Paragraphs should feel like elegant slide body copy, not bullet dumps\n"
        "- Stay faithful to the scene content; do not invent facts\n"
        f"- Write paragraphs in language '{language}'\n"
        "- Image prompt: clean textbook-appropriate illustration, no logos/watermarks/text"
    )
    user = (
        f"Lesson: {lesson_title}\n"
        f"Subject: {subject or 'General'}\n"
        f"Scene title: {scene.title}\n"
        f"Slide headline: {(scene.slide.headline if scene.slide else scene.title)}\n"
        f"Bullets: {bullets}\n"
        f"Narration: {scene.narration}\n"
        f"Visual hint: {scene.visual_prompt or ''}\n"
    )
    content, _provider = await chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.45,
        max_tokens=1200,
    )
    parsed = extract_json_object(content)
    if not isinstance(parsed, dict):
        raise LLMError("Presentation LLM did not return an object")

    paragraphs = [str(p).strip() for p in (parsed.get("paragraphs") or []) if str(p).strip()]
    if not paragraphs:
        paragraphs = _fallback_paragraphs(scene)
    headline = str(parsed.get("headline") or (scene.slide.headline if scene.slide else scene.title)).strip()
    image_prompt = str(parsed.get("image_prompt") or scene.visual_prompt or "").strip() or None

    return PresentationPage(
        scene_id=scene.id,
        title=scene.title,
        headline=headline,
        paragraphs=paragraphs[:4],
        image_prompt=image_prompt,
        media_kind=scene.media_kind,
        status="text_only",
    )


def _fallback_paragraphs(scene: Scene) -> list[str]:
    bullets = scene.slide.bullets if scene.slide else []
    paras = []
    if scene.narration:
        paras.append(scene.narration.strip())
    if bullets:
        paras.append("Key ideas: " + "; ".join(bullets[:4]) + ".")
    return paras or [scene.title]


async def _generate_and_save_image(*, lesson_id: UUID, scene_id: str, prompt: str) -> str:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        raise LLMError("OPENAI_API_KEY required for image generation")

    safe_prompt = (
        f"Educational textbook illustration, clean composition, no text, no watermark, "
        f"no logos, soft natural lighting. Subject: {prompt[:900]}"
    )

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_image_model,
        "prompt": safe_prompt,
        "size": settings.openai_image_size,
        "n": 1,
        "response_format": "b64_json",
    }
    if settings.openai_image_model.startswith("dall-e-3"):
        payload["quality"] = "standard"

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json=payload,
        )
    if response.status_code >= 400:
        raise LLMError(f"OpenAI image failed ({response.status_code}): {response.text}")

    data = response.json()
    b64 = data["data"][0].get("b64_json")
    if not b64:
        url = data["data"][0].get("url")
        if not url:
            raise LLMError("No image data in OpenAI response")
        async with httpx.AsyncClient(timeout=120.0) as client:
            img_resp = await client.get(url)
        if img_resp.status_code >= 400:
            raise LLMError("Failed to download generated image")
        image_bytes = img_resp.content
    else:
        image_bytes = base64.b64decode(b64)

    images_dir = lesson_dir(lesson_id) / "presentations"
    images_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{scene_id}.png"
    path = images_dir / filename
    path.write_bytes(image_bytes)

    return f"/uploads/{lesson_id}/presentations/{filename}"
