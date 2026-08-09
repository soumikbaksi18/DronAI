from fastapi import APIRouter

from app.models.schemas import HealthResponse
from app.services.genai_client import GenAIClient

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="backend", version="0.1.0")


@router.get("/health/dependencies")
async def health_dependencies() -> dict:
    genai = GenAIClient()
    try:
        genai_health = await genai.health()
        genai_status = "ok"
    except Exception as exc:  # noqa: BLE001 - surface dependency status in init scaffold
        genai_health = {"error": str(exc)}
        genai_status = "unavailable"

    return {
        "backend": "ok",
        "genai_microservices": {"status": genai_status, "details": genai_health},
    }
