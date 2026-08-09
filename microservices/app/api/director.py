from fastapi import APIRouter

from app.agents.director_agent import plan_scenes_from_parts
from app.models.schemas import DirectorPlanRequest, DirectorPlanResponse

router = APIRouter(prefix="/v1/director", tags=["director"])


@router.post("/plan-scenes", response_model=DirectorPlanResponse)
async def plan_scenes(payload: DirectorPlanRequest) -> DirectorPlanResponse:
    """Classroom Director: convert Markdown chapter parts into classroom scenes."""
    return await plan_scenes_from_parts(payload)
