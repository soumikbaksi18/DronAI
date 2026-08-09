const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
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

export type MdPart = {
  id: string;
  index: number;
  title: string;
  markdown: string;
  filename: string;
  char_count: number;
  summary?: string | null;
};

export type SlideContent = {
  headline: string;
  bullets: string[];
  speaker_notes?: string | null;
};

export type SceneMediaKind = "presentation" | "video";

export type Scene = {
  id: string;
  part_id?: string | null;
  title: string;
  slide?: SlideContent | null;
  narration: string;
  visual_prompt?: string | null;
  questions: string[];
  media_kind?: SceneMediaKind;
};

export type Lesson = {
  id: string;
  title: string;
  source_text: string;
  source_filename?: string | null;
  source_type?: string | null;
  status: string;
  target_scene_count?: number | null;
  scenes_approved?: boolean;
  director_notes?: string[];
  md_parts: MdPart[];
  parts_dir?: string | null;
  scenes: Scene[];
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
    scene_count?: number;
  }) =>
    request<Lesson>("/v1/lessons", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  uploadLesson: (
    file: File,
    meta?: { title?: string; subject?: string; language?: string; scene_count?: number },
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (meta?.title) form.append("title", meta.title);
    if (meta?.subject) form.append("subject", meta.subject);
    if (meta?.language) form.append("language", meta.language);
    if (meta?.scene_count != null) form.append("scene_count", String(meta.scene_count));
    return request<Lesson>("/v1/lessons/upload", {
      method: "POST",
      body: form,
    });
  },
  getLessonParts: (lessonId: string) => request<MdPart[]>(`/v1/lessons/${lessonId}/parts`),
  generateLesson: (lessonId: string, sceneCount = 8) =>
    request<Lesson>(`/v1/lessons/${lessonId}/generate`, {
      method: "POST",
      body: JSON.stringify({ scene_count: sceneCount }),
    }),
  approveScenes: (lessonId: string) =>
    request<Lesson>(`/v1/lessons/${lessonId}/approve-scenes`, { method: "POST" }),
  classroomCommand: (lessonId: string, command: string, language = "en") =>
    request<Record<string, unknown>>("/v1/classroom/command", {
      method: "POST",
      body: JSON.stringify({ lesson_id: lessonId, command, language }),
    }),
};
