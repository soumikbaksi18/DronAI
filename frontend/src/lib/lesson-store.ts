import type { LessonExperience } from "./types";

const LESSONS_KEY = "gurudrone.lessons";

function readAll(): LessonExperience[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LESSONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LessonExperience[];
  } catch {
    return [];
  }
}

function writeAll(lessons: LessonExperience[]): void {
  localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
}

export function listLessons(): LessonExperience[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getLessonById(id: string): LessonExperience | null {
  return readAll().find((l) => l.id === id) ?? null;
}

export function getLessonBySlug(slug: string): LessonExperience | null {
  return readAll().find((l) => l.slug === slug) ?? null;
}

export function saveLesson(lesson: LessonExperience): LessonExperience {
  const all = readAll();
  const index = all.findIndex((l) => l.id === lesson.id);
  const next = { ...lesson, updatedAt: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  writeAll(all);
  return next;
}

export function deleteLesson(id: string): void {
  writeAll(readAll().filter((l) => l.id !== id));
}

export function shareUrlForSlug(slug: string): string {
  if (typeof window === "undefined") return `/p/${slug}`;
  return `${window.location.origin}/p/${slug}`;
}
