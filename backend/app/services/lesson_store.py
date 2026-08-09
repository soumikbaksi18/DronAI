"""In-memory lesson store for the initialization scaffold.

Replace with a real database (Postgres / Mongo) before production use.
"""

from datetime import datetime
from threading import Lock
from uuid import UUID

from app.models.schemas import Lesson, LessonStatus


class LessonStore:
    def __init__(self) -> None:
        self._lessons: dict[UUID, Lesson] = {}
        self._lock = Lock()

    def create(self, lesson: Lesson) -> Lesson:
        with self._lock:
            self._lessons[lesson.id] = lesson
            return lesson

    def get(self, lesson_id: UUID) -> Lesson | None:
        with self._lock:
            return self._lessons.get(lesson_id)

    def list(self) -> list[Lesson]:
        with self._lock:
            return list(self._lessons.values())

    def update(self, lesson: Lesson) -> Lesson:
        with self._lock:
            lesson.updated_at = datetime.utcnow()
            self._lessons[lesson.id] = lesson
            return lesson

    def set_status(self, lesson_id: UUID, status: LessonStatus) -> Lesson | None:
        with self._lock:
            lesson = self._lessons.get(lesson_id)
            if not lesson:
                return None
            lesson.status = status
            lesson.updated_at = datetime.utcnow()
            self._lessons[lesson_id] = lesson
            return lesson


lesson_store = LessonStore()
