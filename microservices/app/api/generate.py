from fastapi import APIRouter

from app.agents.lesson_agent import generate_lesson
from app.models.schemas import GenerateLessonRequest, GenerateLessonResponse

router = APIRouter(prefix="/v1/generate", tags=["generate"])


@router.post("/lesson", response_model=GenerateLessonResponse)
async def generate_lesson_endpoint(payload: GenerateLessonRequest) -> GenerateLessonResponse:
    return generate_lesson(payload)
