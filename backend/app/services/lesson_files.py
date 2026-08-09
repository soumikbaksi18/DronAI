"""Persist uploaded sources and generated Markdown parts on disk."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from app.core.config import get_settings
from app.models.schemas import MdPart


def lesson_dir(lesson_id: UUID) -> Path:
    settings = get_settings()
    path = Path(settings.upload_dir) / str(lesson_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_source_file(lesson_id: UUID, filename: str, data: bytes) -> Path:
    dest = lesson_dir(lesson_id) / "source" / Path(filename).name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def save_md_parts(lesson_id: UUID, parts: list[MdPart]) -> Path:
    parts_dir = lesson_dir(lesson_id) / "parts"
    if parts_dir.exists():
        for old in parts_dir.glob("*.md"):
            old.unlink()
    parts_dir.mkdir(parents=True, exist_ok=True)

    for part in parts:
        (parts_dir / part.filename).write_text(part.markdown, encoding="utf-8")

    # Combined chapter markdown for convenience / director handoff
    combined = "\n\n---\n\n".join(part.markdown.strip() for part in parts) + "\n"
    (lesson_dir(lesson_id) / "chapter.md").write_text(combined, encoding="utf-8")
    return parts_dir


def parts_dir_path(lesson_id: UUID) -> Path:
    return lesson_dir(lesson_id) / "parts"
