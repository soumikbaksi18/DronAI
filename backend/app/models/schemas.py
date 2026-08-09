from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class LessonStatus(str, Enum):
    DRAFT = "draft"
    PARSING = "parsing"
    PARSED = "parsed"
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
    scene_count: int | None = Field(
        default=None,
        ge=1,
        le=24,
        description="Optional requested number of classroom scenes",
    )


class GenerateScenesRequest(BaseModel):
    scene_count: int = Field(
        default=8,
        ge=1,
        le=24,
        description="How many classroom scenes to plan from the chapter (video generation comes later)",
    )


class MdPart(BaseModel):
    """One structured Markdown section of a chapter, ready for the Classroom Director."""

    id: str
    index: int
    title: str
    markdown: str
    filename: str
    char_count: int = 0
    summary: str | None = None


class SlideContent(BaseModel):
    headline: str
    bullets: list[str] = Field(default_factory=list)
    speaker_notes: str | None = None


class SceneMediaKind(str, Enum):
    """How the scene will be rendered later — only a label in this service."""

    PRESENTATION = "presentation"  # ~80% — PPT-style slides / paragraphs / images
    VIDEO = "video"  # ~20% — short video moments


class Scene(BaseModel):
    id: str
    part_id: str | None = None
    title: str
    slide: SlideContent | None = None
    narration: str
    visual_prompt: str | None = None
    questions: list[str] = Field(default_factory=list)
    media_kind: SceneMediaKind = SceneMediaKind.PRESENTATION


class Lesson(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str
    source_text: str
    source_filename: str | None = None
    source_type: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    language: str = "en"
    target_scene_count: int | None = None
    scenes_approved: bool = False
    director_notes: list[str] = Field(default_factory=list)
    status: LessonStatus = LessonStatus.DRAFT
    md_parts: list[MdPart] = Field(default_factory=list)
    parts_dir: str | None = None
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
