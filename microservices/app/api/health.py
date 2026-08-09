from fastapi import APIRouter

from app.models.schemas import HealthResponse
from app.services.llm import provider_status

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="genai-microservices", version="0.1.0")


@router.get("/health/providers")
async def health_providers() -> dict:
    return {"status": "ok", "providers": provider_status()}
