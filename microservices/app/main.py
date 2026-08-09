from fastapi import FastAPI

from app.api import classroom, director, generate, health, simulate
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "GuruDroneAI GenAI microservices — Classroom Director scene planning, "
        "student persona simulation, and live classroom commands."
    ),
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(director.router)
app.include_router(generate.router)
app.include_router(simulate.router)
app.include_router(classroom.router)


@app.get("/")
async def root() -> dict:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "agents": [
            "director_agent",
            "lesson_agent",
            "student_personas",
        ],
    }
