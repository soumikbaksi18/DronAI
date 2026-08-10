from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse

from app.api import classroom, director, generate, health, simulate, speech, video
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "GuruDroneAI GenAI microservices — Classroom Director scene planning, "
        "Sarvam speech (Bulbul/Saaras), student persona simulation, live classroom "
        "commands, and Sora 2 historical video generation."
    ),
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(director.router)
app.include_router(generate.router)
app.include_router(simulate.router)
app.include_router(classroom.router)
app.include_router(speech.router)
app.include_router(video.router)


STATIC_DIR = Path(__file__).parent / "static"


@app.get("/videogen.html", include_in_schema=False)
async def videogen_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "videogen.html")


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse("/videogen.html")


@app.get("/info")
async def info() -> dict:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "agents": [
            "director_agent",
            "lesson_agent",
            "student_personas",
            "videogen",
        ],
        "video_demo": "/videogen.html",
    }
