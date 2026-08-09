from fastapi import APIRouter, HTTPException

from app.models.schemas import ClassroomCommandRequest, LessonStatus, SimulateRequest
from app.services.genai_client import GenAIClient
from app.services.lesson_store import lesson_store

router = APIRouter(prefix="/v1/classroom", tags=["classroom"])


@router.post("/simulate")
async def simulate_classroom(payload: SimulateRequest) -> dict:
    lesson = lesson_store.get(payload.lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson.status not in {LessonStatus.READY, LessonStatus.SIMULATED}:
        raise HTTPException(status_code=400, detail="Lesson must be generated before simulation")

    lesson_store.set_status(payload.lesson_id, LessonStatus.SIMULATING)

    genai = GenAIClient()
    try:
        report = await genai.simulate_classroom(
            {
                "lesson_id": str(lesson.id),
                "title": lesson.title,
                "scenes": [scene.model_dump() for scene in lesson.scenes],
                "personas": payload.personas,
            }
        )
    except Exception as exc:  # noqa: BLE001
        lesson_store.set_status(payload.lesson_id, LessonStatus.READY)
        raise HTTPException(status_code=502, detail=f"GenAI service error: {exc}") from exc

    lesson_store.set_status(payload.lesson_id, LessonStatus.SIMULATED)
    return report


@router.post("/command")
async def classroom_command(payload: ClassroomCommandRequest) -> dict:
    lesson = lesson_store.get(payload.lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    genai = GenAIClient()
    try:
        result = await genai.handle_classroom_command(
            {
                "lesson_id": str(lesson.id),
                "command": payload.command,
                "language": payload.language,
                "scenes": [scene.model_dump() for scene in lesson.scenes],
            }
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"GenAI service error: {exc}") from exc

    lesson_store.set_status(payload.lesson_id, LessonStatus.LIVE)
    return result
