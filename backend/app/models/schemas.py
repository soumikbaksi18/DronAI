from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class LessonStatus(str, Enum):
    DRAFT = "draft"
    GENERATING = "generating"
    READY = "ready"
    SIMULATING = "simulating"
    SIMULATED = "simulated"
    LIVE = "live"


class LessonCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    source_text: str = Field(..., min_length=1, description="Markdown, notes, or extracted PDF text")
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"


class Scene(BaseModel):
    id: str
    title: str
    narration: str
    visual_prompt: str | None = None
    questions: list[str] = Field(default_factory=list)


class Lesson(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str
    source_text: str
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"
    status: LessonStatus = LessonStatus.DRAFT
    scenes: list[Scene] = Field(default_factory=list)
    quiz: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SimulateRequest(BaseModel):
    lesson_id: UUID
    personas: list[str] = Field(
        default_factory=lambda: [
            "fast_learner",
            "struggling_learner",
            "visual_learner",
            "distracted_learner",
        ]
    )


class ClassroomCommandRequest(BaseModel):
    lesson_id: UUID
    command: str = Field(..., description="Natural language teacher command")
    language: str = "en"


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
