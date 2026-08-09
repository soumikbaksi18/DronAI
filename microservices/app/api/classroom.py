from fastapi import APIRouter

from app.agents.director_agent import handle_command
from app.models.schemas import ClassroomCommandRequest

router = APIRouter(prefix="/v1/classroom", tags=["classroom"])


@router.post("/command")
async def classroom_command(payload: ClassroomCommandRequest) -> dict:
    return handle_command(payload.command, payload.language, payload.scenes)
