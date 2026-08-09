from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import (
    GenerateScenesRequest,
    Lesson,
    LessonCreateRequest,
    LessonStatus,
    MdPart,
)
from app.services.chapter_splitter import split_into_md_parts
from app.services.document_extractor import extract_text, normalize_extension
from app.services.lesson_files import save_md_parts, save_source_file
from app.services.lesson_store import lesson_store
from app.services.scene_planner import clamp_scene_count, plan_scenes_for_lesson

router = APIRouter(prefix="/v1/lessons", tags=["lessons"])


def _ensure_parts(lesson: Lesson) -> list[MdPart]:
    if lesson.md_parts:
        return lesson.md_parts
    parts = split_into_md_parts(lesson.source_text, chapter_title=lesson.title)
    lesson.md_parts = parts
    lesson.parts_dir = str(save_md_parts(lesson.id, parts))
    lesson.status = LessonStatus.PARSED
    lesson_store.update(lesson)
    return parts


@router.get("", response_model=list[Lesson])
async def list_lessons() -> list[Lesson]:
    return lesson_store.list()


@router.post("", response_model=Lesson, status_code=201)
async def create_lesson(payload: LessonCreateRequest) -> Lesson:
    """Create a lesson from pasted Markdown/text and immediately split into MD parts."""
    lesson = Lesson(
        title=payload.title,
        source_text=payload.source_text,
        source_type="markdown",
        subject=payload.subject,
        grade_level=payload.grade_level,
        language=payload.language,
        target_scene_count=payload.scene_count,
        status=LessonStatus.PARSING,
    )
    lesson_store.create(lesson)

    parts = split_into_md_parts(payload.source_text, chapter_title=payload.title)
    lesson.md_parts = parts
    lesson.parts_dir = str(save_md_parts(lesson.id, parts))
    lesson.status = LessonStatus.PARSED
    return lesson_store.update(lesson)


@router.post("/upload", response_model=Lesson, status_code=201)
async def upload_lesson(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    grade_level: str | None = Form(default=None),
    language: str = Form(default="en"),
    scene_count: int | None = Form(default=None),
) -> Lesson:
    """Upload a PDF / Markdown / TXT chapter, extract text, and split into MD parts."""
    filename = file.filename or "upload.txt"
    ext = normalize_extension(filename)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        source_text, extractor = await extract_text(filename, data, language=language)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    lesson_title = (title or Path(filename).stem.replace("_", " ").replace("-", " ")).strip()
    lesson = Lesson(
        title=lesson_title,
        source_text=source_text,
        source_filename=filename,
        source_type=f"{ext.lstrip('.') or 'text'}+{extractor}",
        subject=subject,
        grade_level=grade_level,
        language=language,
        target_scene_count=scene_count,
        status=LessonStatus.PARSING,
    )
    lesson_store.create(lesson)
    save_source_file(lesson.id, filename, data)

    parts = split_into_md_parts(source_text, chapter_title=lesson_title)
    lesson.md_parts = parts
    lesson.parts_dir = str(save_md_parts(lesson.id, parts))
    lesson.status = LessonStatus.PARSED
    return lesson_store.update(lesson)


@router.get("/{lesson_id}", response_model=Lesson)
async def get_lesson(lesson_id: UUID) -> Lesson:
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/{lesson_id}/parts", response_model=list[MdPart])
async def get_lesson_parts(lesson_id: UUID) -> list[MdPart]:
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return _ensure_parts(lesson)


@router.post("/{lesson_id}/parse", response_model=Lesson)
async def reparse_lesson(lesson_id: UUID) -> Lesson:
    """Re-run chapter splitting on the stored source text."""
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    lesson.status = LessonStatus.PARSING
    lesson_store.update(lesson)

    parts = split_into_md_parts(lesson.source_text, chapter_title=lesson.title)
    lesson.md_parts = parts
    lesson.parts_dir = str(save_md_parts(lesson.id, parts))
    lesson.status = LessonStatus.PARSED
    return lesson_store.update(lesson)


@router.post("/{lesson_id}/generate", response_model=Lesson)
async def generate_lesson(
    lesson_id: UUID,
    payload: GenerateScenesRequest = GenerateScenesRequest(),
) -> Lesson:
    """Plan classroom scenes in-backend from MD parts + requested scene count.

    Uses Python packing + Sarvam/OpenAI. Does not call the GenAI microservice.
    Video generation is a later step after scenes are approved.
    """
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    scene_count = payload.scene_count
    parts = _ensure_parts(lesson)
    lesson_store.set_status(lesson_id, LessonStatus.GENERATING)

    try:
        scenes, quiz, notes = await plan_scenes_for_lesson(
            title=lesson.title,
            parts=parts,
            scene_count=scene_count,
            subject=lesson.subject,
            grade_level=lesson.grade_level,
            language=lesson.language,
        )
    except ValueError as exc:
        lesson_store.set_status(lesson_id, LessonStatus.PARSED)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        lesson_store.set_status(lesson_id, LessonStatus.PARSED)
        raise HTTPException(status_code=500, detail=f"Scene planning failed: {exc}") from exc

    lesson = lesson_store.get(lesson_id) or lesson
    lesson.target_scene_count = clamp_scene_count(scene_count)
    lesson.scenes = scenes
    lesson.quiz = quiz
    lesson.director_notes = notes
    lesson.scenes_approved = False
    lesson.status = LessonStatus.READY
    return lesson_store.update(lesson)


@router.post("/{lesson_id}/approve-scenes", response_model=Lesson)
async def approve_scenes(lesson_id: UUID) -> Lesson:
    """Mark planned scenes as approved — gate before Video generation page."""
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if not lesson.scenes:
        raise HTTPException(status_code=400, detail="Plan scenes before approving")

    lesson.scenes_approved = True
    return lesson_store.update(lesson)
