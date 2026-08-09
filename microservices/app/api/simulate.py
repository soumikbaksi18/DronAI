from fastapi import APIRouter

from app.agents.student_personas import simulate_classroom
from app.models.schemas import SimulateRequest

router = APIRouter(prefix="/v1/simulate", tags=["simulate"])


@router.post("/classroom")
async def simulate_classroom_endpoint(payload: SimulateRequest) -> dict:
    return simulate_classroom(payload.title, payload.scenes, payload.personas)
