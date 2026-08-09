"""Classroom Director Agent.

Turns structured MD chapter parts into teachable scenes using:
1. Sarvam 30B (preferred when SARVAM_API_KEY is set)
2. OpenAI chat (fallback — useful if only OPENAI_API_KEY is available)
3. Heuristic stub (always available offline)
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.models.schemas import (
    DirectorPlanRequest,
    DirectorPlanResponse,
    MdPartIn,
    SceneOut,
    SlideContent,
)
from app.services.llm import LLMError, chat_completion
from app.services.sarvam_client import extract_json_object

BATCH_SIZE = 4


async def plan_scenes_from_parts(request: DirectorPlanRequest) -> DirectorPlanResponse:
    provider = "heuristic"
    try:
        scenes, provider = await _plan_scenes_with_llm(request)
    except Exception:
        scenes = [
            _build_scene_from_part(part, language=request.language, subject=request.subject)
            for part in request.parts
        ]
        provider = "heuristic"

    quiz = [
        {
            "id": f"q-{i}",
            "question": scene.questions[0] if scene.questions else f"What did we learn in {scene.title}?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer_index": 0,
            "scene_id": scene.id,
            "part_id": scene.part_id,
        }
        for i, scene in enumerate(scenes[:4], start=1)
    ]

    objectives = [
        f"Understand the main ideas in {request.title}",
        "Follow the chapter section-by-section through classroom scenes",
        "Answer formative questions tied to each part",
    ]
    if request.subject:
        objectives.append(f"Connect concepts to {request.subject}")

    return DirectorPlanResponse(
        scenes=scenes,
        quiz=quiz,
        learning_objectives=objectives,
        director_notes=[
            f"Planned {len(scenes)} scenes from {len(request.parts)} Markdown parts.",
            f"Director provider: {provider}.",
            "Each scene is grounded in one MD part for the next agent handoff.",
        ],
    )


async def _plan_scenes_with_llm(request: DirectorPlanRequest) -> tuple[list[SceneOut], str]:
    scenes: list[SceneOut] = []
    provider_used = "heuristic"

    for start in range(0, len(request.parts), BATCH_SIZE):
        batch = request.parts[start : start + BATCH_SIZE]
        batch_scenes, provider_used = await _plan_batch_with_llm(request, batch)
        scenes.extend(batch_scenes)

    # Ensure every part has a scene even if the model skipped one
    by_part = {scene.part_id: scene for scene in scenes if scene.part_id}
    ordered: list[SceneOut] = []
    for part in request.parts:
        if part.id in by_part:
            ordered.append(by_part[part.id])
        else:
            ordered.append(
                _build_scene_from_part(part, language=request.language, subject=request.subject)
            )
    return ordered, provider_used


async def _plan_batch_with_llm(
    request: DirectorPlanRequest,
    batch: list[MdPartIn],
) -> tuple[list[SceneOut], str]:
    parts_payload = [
        {
            "id": part.id,
            "title": part.title,
            "markdown": part.markdown[:1800],
        }
        for part in batch
    ]

    system = (
        "You are the Classroom Director for GuruDroneAI, an AI co-teacher for Indian classrooms. "
        "Given NCERT-style Markdown chapter parts, create teachable classroom scenes. "
        "Return ONLY valid JSON (no markdown fences) with this shape:\n"
        "{"
        '"scenes":['
        "{"
        '"part_id":"part-01",'
        '"title":"...",'
        '"headline":"...",'
        '"bullets":["...","..."],'
        '"narration":"spoken teacher script, 2-4 sentences",'
        '"visual_prompt":"image generation prompt for classroom visual",'
        '"questions":["...","..."],'
        '"speaker_notes":"..."'
        "}"
        "]"
        "}\n"
        "Rules: one scene per part_id; bullets max 5 short points; keep narration classroom-friendly; "
        f"write narration primarily in language code '{request.language}'."
    )
    user = (
        f"Lesson title: {request.title}\n"
        f"Subject: {request.subject or 'General'}\n"
        f"Grade: {request.grade_level or 'unspecified'}\n"
        f"Parts JSON:\n{json.dumps(parts_payload, ensure_ascii=False)}"
    )

    content, provider = await chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.35,
        max_tokens=3200,
    )
    parsed = extract_json_object(content)
    raw_scenes = parsed.get("scenes") if isinstance(parsed, dict) else parsed
    if not isinstance(raw_scenes, list):
        raise LLMError("LLM did not return a scenes list")

    part_lookup = {part.id: part for part in batch}
    scenes: list[SceneOut] = []
    for item in raw_scenes:
        if not isinstance(item, dict):
            continue
        part_id = str(item.get("part_id") or "")
        part = part_lookup.get(part_id)
        title = str(item.get("title") or (part.title if part else "Scene"))
        bullets = [str(b).strip() for b in (item.get("bullets") or []) if str(b).strip()][:5]
        questions = [str(q).strip() for q in (item.get("questions") or []) if str(q).strip()][:3]
        narration = str(item.get("narration") or "").strip()
        visual = str(item.get("visual_prompt") or "").strip() or None
        headline = str(item.get("headline") or title)
        notes = str(item.get("speaker_notes") or (bullets[0] if bullets else title))

        if not bullets and part:
            bullets = _extract_bullets(_strip_markdown_heading(part.markdown))
        if not narration and part:
            narration = _build_narration(title, _strip_markdown_heading(part.markdown), language=request.language)
        if not questions:
            questions = [
                f"What is the key idea in '{title}'?",
                f"Can you explain '{title}' in your own words?",
            ]

        scenes.append(
            SceneOut(
                id=f"scene-{part_id or len(scenes) + 1}",
                part_id=part_id or None,
                title=title,
                slide=SlideContent(headline=headline, bullets=bullets, speaker_notes=notes),
                narration=narration,
                visual_prompt=visual
                or _build_visual_prompt(title, bullets, subject=request.subject),
                questions=questions,
            )
        )

    if not scenes:
        raise LLMError("No scenes parsed from LLM response")
    return scenes, provider


def _build_scene_from_part(
    part: MdPartIn,
    *,
    language: str,
    subject: str | None,
) -> SceneOut:
    body = _strip_markdown_heading(part.markdown)
    bullets = _extract_bullets(body)
    narration = _build_narration(part.title, body, language=language)
    visual = _build_visual_prompt(part.title, bullets, subject=subject)

    return SceneOut(
        id=f"scene-{part.id}",
        part_id=part.id,
        title=part.title,
        slide=SlideContent(
            headline=part.title,
            bullets=bullets,
            speaker_notes=part.summary or (bullets[0] if bullets else part.title),
        ),
        narration=narration,
        visual_prompt=visual,
        questions=[
            f"What is the key idea in '{part.title}'?",
            f"Can you explain '{part.title}' in your own words?",
        ],
    )


def _strip_markdown_heading(markdown: str) -> str:
    lines = markdown.strip().splitlines()
    if lines and lines[0].lstrip().startswith("#"):
        lines = lines[1:]
    while lines and (not lines[0].strip() or lines[0].strip().startswith(">")):
        lines = lines[1:]
    return "\n".join(lines).strip()


def _extract_bullets(body: str, max_bullets: int = 5) -> list[str]:
    sentences = [
        re.sub(r"\s+", " ", s).strip(" -•")
        for s in re.split(r"(?<=[.!?])\s+|\n+", body)
        if s and len(s.strip()) > 25
    ]
    bullets: list[str] = []
    for sentence in sentences:
        clipped = sentence if len(sentence) <= 140 else sentence[:137].rstrip() + "…"
        bullets.append(clipped)
        if len(bullets) >= max_bullets:
            break
    if not bullets:
        compact = re.sub(r"\s+", " ", body).strip()
        bullets = [compact[:140] + ("…" if len(compact) > 140 else "")] if compact else ["Key ideas from this section."]
    return bullets


def _build_narration(title: str, body: str, *, language: str) -> str:
    compact = re.sub(r"\s+", " ", body).strip()
    excerpt = compact[:500] + ("…" if len(compact) > 500 else "")
    return (
        f"[{language}] Scene: {title}. "
        f"Let's walk through this part of the chapter. {excerpt}"
    )


def _build_visual_prompt(title: str, bullets: list[str], *, subject: str | None) -> str:
    subject_bit = f"{subject} classroom " if subject else "classroom "
    focus = bullets[0] if bullets else title
    return (
        f"Clean educational {subject_bit}illustration for NCERT-style chapter section "
        f"'{title}'. Visual focus: {focus}. No text clutter, textbook-appropriate."
    )


async def handle_command(command: str, language: str, scenes: list[dict[str, Any]]) -> dict[str, Any]:
    scene = scenes[0] if scenes else None
    context_title = (scene or {}).get("title") or "the current topic"
    context_narration = (scene or {}).get("narration") or ""

    try:
        content, provider = await chat_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Guru, a live classroom co-teacher for Indian students. "
                        "Respond to the teacher's mid-class command briefly and helpfully. "
                        "Return ONLY JSON: "
                        '{"action":"translate_and_explain|skip_section|ask_class|give_example|simplify|general_assist",'
                        '"spoken_response":"..."}'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Language preference: {language}\n"
                        f"Current scene: {context_title}\n"
                        f"Scene narration: {context_narration[:600]}\n"
                        f"Teacher command: {command}"
                    ),
                },
            ],
            temperature=0.4,
            max_tokens=500,
        )
        parsed = extract_json_object(content)
        action = str(parsed.get("action") or "general_assist")
        spoken = str(parsed.get("spoken_response") or content)
        return {
            "action": action,
            "spoken_response": spoken,
            "language": language,
            "provider": provider,
            "ui_hints": {
                "highlight_scene_id": (scene or {}).get("id"),
                "show_alternate_explanation": action
                in {"simplify", "give_example", "translate_and_explain"},
            },
        }
    except Exception:
        return _handle_command_heuristic(command, language, scenes)


def _handle_command_heuristic(
    command: str,
    language: str,
    scenes: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = command.strip().lower()
    scene = scenes[0] if scenes else None

    if "hindi" in normalized or language.lower() in {"hi", "hindi"}:
        action = "translate_and_explain"
        response = (
            "मैं इस अवधारणा को सरल हिंदी में समझाता/समझाती हूँ। "
            "(Configure SARVAM_API_KEY or OPENAI_API_KEY for a live explanation.)"
        )
    elif "skip" in normalized:
        action = "skip_section"
        response = "Skipping the current section and moving to the next scene."
    elif "question" in normalized or "ask" in normalized:
        action = "ask_class"
        questions = (scene or {}).get("questions") or []
        response = questions[0] if questions else "What is the main idea we just covered?"
    elif "example" in normalized:
        action = "give_example"
        response = f"Here is another example related to '{(scene or {}).get('title', 'this topic')}'."
    elif "simplify" in normalized or "simply" in normalized:
        action = "simplify"
        response = "Let me explain this more simply, step by step."
    else:
        action = "general_assist"
        response = f"Understood: '{command}'."

    return {
        "action": action,
        "spoken_response": response,
        "language": language,
        "provider": "heuristic",
        "ui_hints": {
            "highlight_scene_id": (scene or {}).get("id"),
            "show_alternate_explanation": action
            in {"simplify", "give_example", "translate_and_explain"},
        },
    }
