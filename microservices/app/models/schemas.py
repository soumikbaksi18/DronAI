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


class VideoJobResponse(BaseModel):
    id: str
    status: str
    stage: str
    mode: str
    prompt: str
    seconds: str
    character: str | None = None
    progress: int = 0
    source_language: str = "en-IN"
    target_language: str = "en-IN"
    translation_model: str | None = None
    translation_style: str | None = None
    script: str | None = None
    translated_script: str | None = None
    video_url: str | None = None
    audio_url: str | None = None
    final_video_url: str | None = None
    timing: dict[str, Any] | None = None
    pause_alignment: dict[str, Any] | None = None
    message: str = ""
    error: str | None = None
    failed_stage: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
