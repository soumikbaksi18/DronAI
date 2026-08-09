"""Classroom Director Agent.

Responsibilities in this scaffold:
1. Turn structured MD chapter parts into teachable scenes
   (slide content, visual prompts, narration scripts, questions)
2. Route live teacher commands during class

Your teammate can replace `_build_scene_from_part` with real LLM / visual /
TTS pipelines while keeping the same request/response contract.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.schemas import (
    DirectorPlanRequest,
    DirectorPlanResponse,
    MdPartIn,
    SceneOut,
    SlideContent,
)


def plan_scenes_from_parts(request: DirectorPlanRequest) -> DirectorPlanResponse:
    scenes: list[SceneOut] = []
    for part in request.parts:
        scenes.append(_build_scene_from_part(part, language=request.language, subject=request.subject))

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
            "Stub director — swap scene builder for LLM/visual/narration generation.",
            "Each scene is grounded in one MD part for the next agent handoff.",
        ],
    )


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
    # Drop chapter blockquote metadata
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


def handle_command(command: str, language: str, scenes: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = command.strip().lower()
    scene = scenes[0] if scenes else None

    if "hindi" in normalized or language.lower() in {"hi", "hindi"}:
        action = "translate_and_explain"
        response = (
            "मैं इस अवधारणा को सरल हिंदी में समझाता/समझाती हूँ। "
            "(Scaffold: wire Sarvam / LLM for real multilingual explanation.)"
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
        response = f"Understood: '{command}'. (Scaffold director — connect real agent reasoning next.)"

    return {
        "action": action,
        "spoken_response": response,
        "language": language,
        "ui_hints": {
            "highlight_scene_id": (scene or {}).get("id"),
            "show_alternate_explanation": action
            in {"simplify", "give_example", "translate_and_explain"},
        },
    }
