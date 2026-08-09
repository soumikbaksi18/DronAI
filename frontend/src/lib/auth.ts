import type { TeacherSession } from "./types";

const TEACHER_KEY = "gurudrone.teacher";

export function getTeacherSession(): TeacherSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TEACHER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeacherSession;
  } catch {
    return null;
  }
}

export function setTeacherSession(session: TeacherSession): void {
  localStorage.setItem(TEACHER_KEY, JSON.stringify(session));
}

export function clearTeacherSession(): void {
  localStorage.removeItem(TEACHER_KEY);
}

export function mockLogin(email: string, name?: string): TeacherSession {
  const session: TeacherSession = {
    id: `teacher-${Date.now().toString(36)}`,
    name: name?.trim() || email.split("@")[0] || "Teacher",
    email: email.trim().toLowerCase(),
  };
  setTeacherSession(session);
  return session;
}
