from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import classroom, health, lessons
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="GuruDroneAI API — orchestrates lessons, simulation, and live classroom flows.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(lessons.router)
app.include_router(classroom.router)


@app.get("/")
async def root() -> dict:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "core_loop": ["create", "simulate", "critique", "refine", "teach", "adapt"],
    }
