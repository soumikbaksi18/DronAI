"""Lesson Planner / Content Agent — scaffold implementation."""

from app.models.schemas import GenerateLessonRequest, GenerateLessonResponse, SceneOut


def _chunk_source(text: str, max_chunks: int = 5) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()] if text.strip() else ["Untitled content"]
    return paragraphs[:max_chunks]


def generate_lesson(request: GenerateLessonRequest) -> GenerateLessonResponse:
    chunks = _chunk_source(request.source_text)
    scenes: list[SceneOut] = []

    for index, chunk in enumerate(chunks, start=1):
        title = chunk.split("\n", 1)[0][:80] or f"Scene {index}"
        scenes.append(
            SceneOut(
                id=f"scene-{index}",
                title=title,
                narration=(
                    f"[{request.language}] Explain: {chunk[:400]}"
                    + ("..." if len(chunk) > 400 else "")
                ),
                visual_prompt=f"Educational illustration for: {title}",
                questions=[
                    f"What is the key idea in '{title}'?",
                    f"Can you give an example related to '{title}'?",
                ],
            )
        )

    quiz = [
        {
            "id": f"q-{i}",
            "question": scene.questions[0] if scene.questions else f"Question about {scene.title}",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer_index": 0,
        }
        for i, scene in enumerate(scenes[:3], start=1)
    ]

    return GenerateLessonResponse(
        scenes=scenes,
        quiz=quiz,
        learning_objectives=[
            f"Understand the core ideas in {request.title}",
            "Answer formative questions during the lesson",
            "Identify where students may struggle",
        ],
    )
