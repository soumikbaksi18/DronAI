const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
};

export type Lesson = {
  id: string;
  title: string;
  source_text: string;
  status: string;
  scenes: Array<{
    id: string;
    title: string;
    narration: string;
    visual_prompt?: string | null;
    questions: string[];
  }>;
  quiz: unknown[];
};

export const api = {
  health: () => request<HealthResponse>("/health"),
  createLesson: (body: {
    title: string;
    source_text: string;
    subject?: string;
    grade_level?: string;
    language?: string;
  }) =>
    request<Lesson>("/v1/lessons", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generateLesson: (lessonId: string) =>
    request<Lesson>(`/v1/lessons/${lessonId}/generate`, { method: "POST" }),
  simulateClassroom: (lessonId: string) =>
    request<Record<string, unknown>>("/v1/classroom/simulate", {
      method: "POST",
      body: JSON.stringify({ lesson_id: lessonId }),
    }),
  classroomCommand: (lessonId: string, command: string, language = "en") =>
    request<Record<string, unknown>>("/v1/classroom/command", {
      method: "POST",
      body: JSON.stringify({ lesson_id: lessonId, command, language }),
    }),
};
