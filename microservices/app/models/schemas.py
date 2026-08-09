from typing import Any

from pydantic import BaseModel, Field


class MdPartIn(BaseModel):
    id: str
    index: int | None = None
    title: str
    markdown: str
    filename: str | None = None
    char_count: int | None = None
    summary: str | None = None


class DirectorPlanRequest(BaseModel):
    title: str
    parts: list[MdPartIn] = Field(..., min_length=1)
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"


class SlideContent(BaseModel):
    headline: str
    bullets: list[str] = Field(default_factory=list)
    speaker_notes: str | None = None


class SceneOut(BaseModel):
    id: str
    part_id: str | None = None
    title: str
    slide: SlideContent
    narration: str
    visual_prompt: str | None = None
    questions: list[str] = Field(default_factory=list)


class DirectorPlanResponse(BaseModel):
    scenes: list[SceneOut]
    quiz: list[dict[str, Any]] = Field(default_factory=list)
    learning_objectives: list[str] = Field(default_factory=list)
    director_notes: list[str] = Field(default_factory=list)


class GenerateLessonRequest(BaseModel):
    title: str
    source_text: str
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"


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
