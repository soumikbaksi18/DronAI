"""Plan classroom scenes in the backend from MD parts + teacher scene count.

No GenAI microservice dependency:
1. Python packs chapter parts into N buckets from requested scene count
2. Sarvam 30B / OpenAI writes slide + narration + visual + questions per bucket
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.core.config import get_settings
from app.models.schemas import MdPart, Scene, SceneMediaKind, SlideContent
from app.services.llm import LLMError, chat_completion, extract_json_object

BATCH_SIZE = 4


@dataclass
class SceneBucket:
    index: int
    title: str
    markdown: str
    source_part_ids: list[str]
    target_seconds: int


def clamp_scene_count(scene_count: int) -> int:
    settings = get_settings()
    if scene_count <= 0:
        raise ValueError("scene_count must be > 0")
    return max(settings.min_scenes, min(settings.max_scenes, int(scene_count)))


def pack_parts_into_buckets(
    parts: list[MdPart],
    *,
    target_scenes: int,
) -> list[SceneBucket]:
    """Redistribute MD parts into exactly `target_scenes` content buckets."""
    if not parts:
        raise ValueError("No Markdown parts available to plan scenes from.")

    settings = get_settings()
    units = _explode_to_units(parts)
    if len(units) < target_scenes:
        # Not enough content units — keep what we have
        target_scenes = max(1, len(units))

    total_chars = sum(max(unit["char_count"], 1) for unit in units) or 1
    target_chars = total_chars / target_scenes
    seconds_each = max(20, settings.seconds_per_scene)

    buckets: list[list[dict]] = []
    current: list[dict] = []
    current_chars = 0

    for unit_index, unit in enumerate(units):
        current.append(unit)
        current_chars += max(unit["char_count"], 1)
        remaining_units = len(units) - (unit_index + 1)
        if len(buckets) < target_scenes - 1 and (
            current_chars >= target_chars or remaining_units <= (target_scenes - len(buckets) - 1)
        ):
            buckets.append(current)
            current = []
            current_chars = 0

    if current:
        buckets.append(current)

    while len(buckets) > target_scenes:
        buckets[-2].extend(buckets[-1])
        buckets.pop()

    while len(buckets) < target_scenes:
        donor_idx = max(range(len(buckets)), key=lambda i: len(buckets[i]))
        donor = buckets[donor_idx]
        if len(donor) < 2:
            break
        mid = len(donor) // 2
        buckets.insert(donor_idx + 1, donor[mid:])
        buckets[donor_idx] = donor[:mid]

    scene_buckets: list[SceneBucket] = []
    for index, group in enumerate(buckets, start=1):
        title = group[0]["title"] if len(group) == 1 else f"Scene {index}: {group[0]['title']}"
        markdown = "\n\n".join(item["markdown"] for item in group).strip()
        part_ids: list[str] = []
        for item in group:
            for pid in item["source_part_ids"]:
                if pid not in part_ids:
                    part_ids.append(pid)
        scene_buckets.append(
            SceneBucket(
                index=index,
                title=title,
                markdown=markdown,
                source_part_ids=part_ids,
                target_seconds=seconds_each,
            )
        )
    return scene_buckets


async def plan_scenes_for_lesson(
    *,
    title: str,
    parts: list[MdPart],
    scene_count: int,
    subject: str | None = None,
    grade_level: str | None = None,
    language: str = "en",
) -> tuple[list[Scene], list[dict], list[str]]:
    """Return (scenes, quiz, director_notes)."""
    target_scenes = clamp_scene_count(scene_count)
    buckets = pack_parts_into_buckets(parts, target_scenes=target_scenes)

    provider = "heuristic"
    try:
        scenes, provider = await _plan_with_llm(
            title=title,
            buckets=buckets,
            subject=subject,
            grade_level=grade_level,
            language=language,
        )
    except Exception:
        scenes = [_heuristic_scene(bucket, language=language, subject=subject) for bucket in buckets]
        provider = "heuristic"

    if len(scenes) != len(buckets):
        by_id = {s.id: s for s in scenes}
        ordered: list[Scene] = []
        for bucket in buckets:
            sid = f"scene-{bucket.index:02d}"
            ordered.append(
                by_id.get(sid)
                or _heuristic_scene(bucket, language=language, subject=subject)
            )
        scenes = ordered

    scenes = assign_scene_media_kinds(scenes)
    presentation_n = sum(1 for s in scenes if s.media_kind == SceneMediaKind.PRESENTATION)
    video_n = sum(1 for s in scenes if s.media_kind == SceneMediaKind.VIDEO)

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

    notes = [
        f"Planned {len(scenes)} classroom scenes (requested {scene_count}, clamped to {target_scenes}).",
        f"Media mix: {presentation_n} presentation (~80%), {video_n} video (~20%) — labels only; content later.",
        f"Director provider: {provider}"
        + (" (sarvam-30b)" if provider == "sarvam" else "")
        + ".",
        "Approve these scenes before moving to the Video generation page.",
    ]
    return scenes, quiz, notes


def assign_scene_media_kinds(scenes: list[Scene]) -> list[Scene]:
    """Mark ~80% of scenes as presentation (ordinary) and ~20% as video (standout).

    Only sets labels — no PPT/video assets are generated here.
    """
    if not scenes:
        return scenes

    n = len(scenes)
    # Prefer exact 80/20 when possible (e.g. 10 → 8 presentation / 2 video)
    video_count = int(round(n * 0.2))
    if n >= 5:
        video_count = max(1, video_count)
    video_count = min(video_count, n)

    scored = sorted(
        enumerate(scenes),
        key=lambda item: (_scene_standout_score(item[1]), item[0]),
        reverse=True,
    )
    video_indexes = {idx for idx, _ in scored[:video_count]}

    labeled: list[Scene] = []
    for index, scene in enumerate(scenes):
        kind = SceneMediaKind.VIDEO if index in video_indexes else SceneMediaKind.PRESENTATION
        labeled.append(scene.model_copy(update={"media_kind": kind}))
    return labeled


def _scene_standout_score(scene: Scene) -> float:
    """Higher = more cinematic / less 'mediocre' → prefer VIDEO label."""
    text = " ".join(
        [
            scene.title or "",
            scene.narration or "",
            scene.visual_prompt or "",
            " ".join(scene.questions or []),
            " ".join((scene.slide.bullets if scene.slide else []) or []),
        ]
    ).lower()

    score = 0.0
    # Everyday / definitional content → presentation
    for token in (
        "definition",
        "means",
        "summary",
        "sources",
        "dates mean",
        "introduction",
        "recap",
        "exercise",
        "let's discuss",
        "in short",
    ):
        if token in text:
            score -= 2.0

    # Dramatic / visual / narrative moments → video
    for token in (
        "revolution",
        "battle",
        "war",
        "protest",
        "march",
        "storm",
        "revolt",
        "uprising",
        "assassination",
        "coronation",
        "journey",
        "map",
        "timeline",
        "experiment",
        "discovery",
        "drama",
        "story",
        "imagine",
        "visual",
        "ceremony",
        "riot",
        "freedom",
        "independence",
    ):
        if token in text:
            score += 2.5

    # Slight preference for richer visual prompts / longer spoken beats
    score += min(len(scene.visual_prompt or ""), 180) / 120.0
    score += min(len(scene.narration or ""), 400) / 400.0
    return score


def _explode_to_units(parts: list[MdPart]) -> list[dict]:
    """Turn parts into smaller units so we can form more scenes than MD parts when needed."""
    units: list[dict] = []
    for part in parts:
        body = part.markdown.strip()
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        if len(paragraphs) <= 1 or part.char_count < 700:
            units.append(
                {
                    "title": part.title,
                    "markdown": body,
                    "char_count": max(part.char_count, len(body)),
                    "source_part_ids": [part.id],
                }
            )
            continue
        for idx, para in enumerate(paragraphs, start=1):
            units.append(
                {
                    "title": f"{part.title} ({idx})",
                    "markdown": para,
                    "char_count": len(para),
                    "source_part_ids": [part.id],
                }
            )
    return units


async def _plan_with_llm(
    *,
    title: str,
    buckets: list[SceneBucket],
    subject: str | None,
    grade_level: str | None,
    language: str,
) -> tuple[list[Scene], str]:
    scenes: list[Scene] = []
    provider = "heuristic"
    for start in range(0, len(buckets), BATCH_SIZE):
        batch = buckets[start : start + BATCH_SIZE]
        batch_scenes, provider = await _plan_batch(
            title=title,
            batch=batch,
            subject=subject,
            grade_level=grade_level,
            language=language,
            total_scenes=len(buckets),
        )
        scenes.extend(batch_scenes)
    return scenes, provider


async def _plan_batch(
    *,
    title: str,
    batch: list[SceneBucket],
    subject: str | None,
    grade_level: str | None,
    language: str,
    total_scenes: int,
) -> tuple[list[Scene], str]:
    payload = [
        {
            "scene_index": bucket.index,
            "title": bucket.title,
            "target_seconds": bucket.target_seconds,
            "source_part_ids": bucket.source_part_ids,
            "markdown": bucket.markdown[:2200],
        }
        for bucket in batch
    ]

    system = (
        "You are the Classroom Director for GuruDroneAI. "
        "Create teachable classroom scenes for Indian school students from NCERT-style Markdown. "
        "Return ONLY valid JSON (no fences):\n"
        '{"scenes":[{"scene_index":1,"title":"...","headline":"...","bullets":["..."],'
        '"narration":"...","visual_prompt":"...","questions":["..."],"speaker_notes":"..."}]}\n'
        "Rules:\n"
        "- One scene object per scene_index\n"
        "- Narration length should roughly fit target_seconds when spoken (~2.2 words/sec)\n"
        "- Bullets: 3-5 short student-friendly points\n"
        "- Stay faithful to source; do not invent historical facts\n"
        f"- Write narration mainly in language '{language}'\n"
        "- Questions should check understanding\n"
        "- Do not mention video production or rendering — scenes only"
    )
    user = (
        f"Lesson: {title}\n"
        f"Subject: {subject or 'General'}\n"
        f"Grade: {grade_level or 'middle/secondary'}\n"
        f"Create exactly these classroom scenes ({total_scenes} total in the lesson).\n"
        f"Buckets:\n{json.dumps(payload, ensure_ascii=False)}"
    )

    content, provider = await chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.4,
        max_tokens=4000,
    )
    parsed = extract_json_object(content)
    raw = parsed.get("scenes") if isinstance(parsed, dict) else parsed
    if not isinstance(raw, list):
        raise LLMError("LLM did not return scenes list")

    by_index = {bucket.index: bucket for bucket in batch}
    scenes: list[Scene] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("scene_index"))
        except (TypeError, ValueError):
            continue
        bucket = by_index.get(index)
        if not bucket:
            continue
        bullets = [str(b).strip() for b in (item.get("bullets") or []) if str(b).strip()][:5]
        questions = [str(q).strip() for q in (item.get("questions") or []) if str(q).strip()][:3]
        narration = str(item.get("narration") or "").strip()
        title_out = str(item.get("title") or bucket.title)
        headline = str(item.get("headline") or title_out)
        notes = str(item.get("speaker_notes") or (bullets[0] if bullets else title_out))
        visual = str(item.get("visual_prompt") or "").strip() or _visual_prompt(
            title_out, bullets, subject=subject
        )
        if not bullets:
            bullets = _extract_bullets(bucket.markdown)
        if not narration:
            narration = _heuristic_narration(bucket, language=language)
        if not questions:
            questions = [
                f"What is the key idea in '{title_out}'?",
                f"Can you explain '{title_out}' in your own words?",
            ]
        scenes.append(
            Scene(
                id=f"scene-{index:02d}",
                part_id=bucket.source_part_ids[0] if bucket.source_part_ids else None,
                title=title_out,
                slide=SlideContent(headline=headline, bullets=bullets, speaker_notes=notes),
                narration=narration,
                visual_prompt=visual,
                questions=questions,
            )
        )

    if not scenes:
        raise LLMError("No scenes parsed from LLM")
    return scenes, provider


def _heuristic_scene(bucket: SceneBucket, *, language: str, subject: str | None) -> Scene:
    bullets = _extract_bullets(bucket.markdown)
    title = bucket.title
    return Scene(
        id=f"scene-{bucket.index:02d}",
        part_id=bucket.source_part_ids[0] if bucket.source_part_ids else None,
        title=title,
        slide=SlideContent(
            headline=title,
            bullets=bullets,
            speaker_notes=bullets[0] if bullets else title,
        ),
        narration=_heuristic_narration(bucket, language=language),
        visual_prompt=_visual_prompt(title, bullets, subject=subject),
        questions=[
            f"What is the key idea in '{title}'?",
            f"Can you explain '{title}' in your own words?",
        ],
    )


def _heuristic_narration(bucket: SceneBucket, *, language: str) -> str:
    compact = re.sub(r"\s+", " ", bucket.markdown).strip()
    word_budget = max(40, int(bucket.target_seconds * 2.2))
    words = compact.split()
    excerpt = " ".join(words[:word_budget])
    if len(words) > word_budget:
        excerpt += "…"
    return f"[{language}] {bucket.title}. {excerpt}"


def _extract_bullets(body: str, max_bullets: int = 5) -> list[str]:
    sentences = [
        re.sub(r"\s+", " ", s).strip(" -•#>")
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
        bullets = [compact[:140] + ("…" if len(compact) > 140 else "")] if compact else ["Key ideas."]
    return bullets


def _visual_prompt(title: str, bullets: list[str], *, subject: str | None) -> str:
    subject_bit = f"{subject} classroom " if subject else "classroom "
    focus = bullets[0] if bullets else title
    return (
        f"Clean educational {subject_bit}illustration for '{title}'. "
        f"Visual focus: {focus}. No text clutter, textbook-appropriate."
    )
