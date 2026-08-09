from typing import Any

from pydantic import BaseModel, Field


class GenerateLessonRequest(BaseModel):
    title: str
    source_text: str
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"


class SceneOut(BaseModel):
    id: str
    title: str
    narration: str
    visual_prompt: str | None = None
    questions: list[str] = Field(default_factory=list)


class GenerateLessonResponse(BaseModel):
    scenes: list[SceneOut]
    quiz: list[dict[str, Any]] = Field(default_factory=list)
    learning_objectives: list[str] = Field(default_factory=list)


class SimulateRequest(BaseModel):
    lesson_id: str
    title: str
    scenes: list[dict[str, Any]]
    personas: list[str] = Field(default_factory=list)


class ClassroomCommandRequest(BaseModel):
    lesson_id: str
    command: str
    language: str = "en"
    scenes: list[dict[str, Any]] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
