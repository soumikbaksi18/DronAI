"""Legacy whole-text lesson generator.

Prefer the Classroom Director (`director_agent.plan_scenes_from_parts`) which
consumes structured MD parts from the lesson input pipeline.
"""

from app.agents.director_agent import plan_scenes_from_parts
from app.models.schemas import (
    DirectorPlanRequest,
    GenerateLessonRequest,
    GenerateLessonResponse,
    MdPartIn,
)


def _chunk_source(text: str, max_chunks: int = 8) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()] if text.strip() else ["Untitled content"]
    return paragraphs[:max_chunks]


def generate_lesson(request: GenerateLessonRequest) -> GenerateLessonResponse:
    chunks = _chunk_source(request.source_text)
    parts = [
        MdPartIn(
            id=f"part-{index:02d}",
            index=index,
            title=(chunk.split("\n", 1)[0][:80] or f"Part {index}"),
            markdown=f"# Part {index}\n\n{chunk}\n",
        )
        for index, chunk in enumerate(chunks, start=1)
    ]
    planned = plan_scenes_from_parts(
        DirectorPlanRequest(
            title=request.title,
            parts=parts,
            subject=request.subject,
            grade_level=request.grade_level,
            language=request.language,
        )
    )
    return GenerateLessonResponse(
        scenes=planned.scenes,
        quiz=planned.quiz,
        learning_objectives=planned.learning_objectives,
    )
