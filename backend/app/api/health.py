from fastapi import APIRouter

from app.core.config import get_settings
from app.models.schemas import HealthResponse
from app.services.genai_client import GenAIClient

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="backend", version="0.1.0")


@router.get("/health/dependencies")
async def health_dependencies() -> dict:
    settings = get_settings()
    genai = GenAIClient()
    try:
        genai_health = await genai.health()
        genai_status = "ok"
    except Exception as exc:  # noqa: BLE001 - surface dependency status in init scaffold
        genai_health = {"error": str(exc)}
        genai_status = "unavailable"

    return {
        "backend": "ok",
        "scene_planner": {
            "sarvam": settings.has_sarvam,
            "openai": settings.has_openai,
            "preferred": (
                "sarvam" if settings.has_sarvam else "openai" if settings.has_openai else "heuristic"
            ),
            "seconds_per_scene": settings.seconds_per_scene,
        },
        "sarvam": {
            "configured": settings.has_sarvam,
            "document_ai": settings.use_sarvam_document_ai and settings.has_sarvam,
        },
        "genai_microservices": {"status": genai_status, "details": genai_health},
    }
