from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import Lesson, LessonCreateRequest, LessonStatus, MdPart, Scene, SlideContent
from app.services.chapter_splitter import split_into_md_parts
from app.services.document_extractor import extract_text, normalize_extension
from app.services.genai_client import GenAIClient
from app.services.lesson_files import save_md_parts, save_source_file
from app.services.lesson_store import lesson_store

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


def _scene_from_dict(data: dict) -> Scene:
    slide_data = data.get("slide")
    slide = SlideContent(**slide_data) if isinstance(slide_data, dict) else None
    return Scene(
        id=data["id"],
        part_id=data.get("part_id"),
        title=data["title"],
        slide=slide,
        narration=data.get("narration", ""),
        visual_prompt=data.get("visual_prompt"),
        questions=data.get("questions") or [],
    )


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
) -> Lesson:
    """Upload a PDF / Markdown / TXT chapter, extract text, and split into MD parts."""
    filename = file.filename or "upload.txt"
    ext = normalize_extension(filename)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        source_text = extract_text(filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    lesson_title = (title or Path(filename).stem.replace("_", " ").replace("-", " ")).strip()
    lesson = Lesson(
        title=lesson_title,
        source_text=source_text,
        source_filename=filename,
        source_type=ext.lstrip(".") or "text",
        subject=subject,
        grade_level=grade_level,
        language=language,
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
async def generate_lesson(lesson_id: UUID) -> Lesson:
    """Ask the Classroom Director to build scenes from MD parts."""
    lesson = lesson_store.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    parts = _ensure_parts(lesson)
    lesson_store.set_status(lesson_id, LessonStatus.GENERATING)

    genai = GenAIClient()
    try:
        result = await genai.plan_scenes(
            {
                "title": lesson.title,
                "subject": lesson.subject,
                "grade_level": lesson.grade_level,
                "language": lesson.language,
                "parts": [part.model_dump() for part in parts],
            }
        )
    except Exception as exc:  # noqa: BLE001
        lesson_store.set_status(lesson_id, LessonStatus.PARSED)
        raise HTTPException(status_code=502, detail=f"GenAI service error: {exc}") from exc

    lesson = lesson_store.get(lesson_id) or lesson
    lesson.scenes = [_scene_from_dict(scene) for scene in result.get("scenes", [])]
    lesson.quiz = result.get("quiz", [])
    lesson.status = LessonStatus.READY
    return lesson_store.update(lesson)
