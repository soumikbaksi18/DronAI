"""HTTP client for the GenAI microservice."""

from typing import Any

import httpx

from app.core.config import get_settings


class GenAIClient:
    def __init__(self, base_url: str | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.genai_service_url).rstrip("/")

    async def health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()

    async def plan_scenes(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Classroom Director: MD parts → scenes (slides / visuals / narration)."""
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(f"{self.base_url}/v1/director/plan-scenes", json=payload)
            response.raise_for_status()
            return response.json()

    async def generate_lesson(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Legacy whole-text generation path (kept for compatibility)."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{self.base_url}/v1/generate/lesson", json=payload)
            response.raise_for_status()
            return response.json()

    async def simulate_classroom(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{self.base_url}/v1/simulate/classroom", json=payload)
            response.raise_for_status()
            return response.json()

    async def handle_classroom_command(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(f"{self.base_url}/v1/classroom/command", json=payload)
            response.raise_for_status()
            return response.json()
