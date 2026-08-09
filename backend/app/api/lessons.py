from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.models.schemas import Lesson, LessonCreateRequest, LessonStatus, Scene
from app.services.genai_client import GenAIClient
from app.services.lesson_store import lesson_store

router = APIRouter(prefix="/v1/lessons", tags=["lessons"])


@router.get("", response_model=list[Lesson])
async def list_lessons() -> list[Lesson]:
    return lesson_store.list()


@router.post("", response_model=Lesson, status_code=201)
async def create_lesson(payload: LessonCreateRequest) -> Lesson:
    lesson = Lesson(
        title=payload.title,
        source_text=payload.source_text,
        subject=payload.subject,
        grade_level=payload.grade_level,
        language=payload.language,
        status=LessonStatus.DRAFT,
    )
    return lesson_store.create(lesson)


@router.get("/{lesson_id}", response_model=Lesson)
async def get_lesson(lesson_id: UUID) -> Lesson:
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.post("/{lesson_id}/generate", response_model=Lesson)
async def generate_lesson(lesson_id: UUID) -> Lesson:
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson_store.set_status(lesson_id, LessonStatus.GENERATING)

    genai = GenAIClient()
    try:
        result = await genai.generate_lesson(
            {
                "title": lesson.title,
                "source_text": lesson.source_text,
                "subject": lesson.subject,
                "grade_level": lesson.grade_level,
                "language": lesson.language,
            }
        )
    except Exception as exc:  # noqa: BLE001
        lesson_store.set_status(lesson_id, LessonStatus.DRAFT)
        raise HTTPException(status_code=502, detail=f"GenAI service error: {exc}") from exc

    lesson.scenes = [Scene(**scene) for scene in result.get("scenes", [])]
    lesson.quiz = result.get("quiz", [])
    lesson.status = LessonStatus.READY
    return lesson_store.update(lesson)
