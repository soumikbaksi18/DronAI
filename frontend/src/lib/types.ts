export type LessonMode = "interactive" | "gamified" | "quiz";

export type LessonStatus = "draft" | "generating" | "ready";

export type CharacterPose = "idle" | "speak" | "walk";

export type SceneType =
  | "title"
  | "concept"
  | "media"
  | "character"
  | "checkpoint"
  | "summary";

export type AssetType = "pdf" | "docx" | "md" | "image" | "video" | "other";

export type LessonAsset = {
  id: string;
  name: string;
  type: AssetType;
  /** Object URL or placeholder path — mock only */
  url: string;
  size: number;
};

export type Hotspot = {
  id: string;
  label: string;
  /** Percent positions within the slide */
  x: number;
  y: number;
  prompt: string;
  reply: string;
};

export type Scene = {
  id: string;
  type: SceneType;
  title: string;
  body: string;
  hotspots: Hotspot[];
  mediaIds: string[];
};

export type LessonCharacter = {
  name: string;
  role: string;
  palette: [string, string, string];
  catchphrase: string;
  poses: CharacterPose[];
};

export type LessonExperience = {
  id: string;
  slug: string;
  title: string;
  durationMin: 15 | 30 | 45 | 60;
  mode: LessonMode;
  assets: LessonAsset[];
  sourceText: string;
  character: LessonCharacter;
  scenes: Scene[];
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeacherSession = {
  id: string;
  name: string;
  email: string;
};

export const DURATION_SCENE_COUNTS: Record<15 | 30 | 45 | 60, number> = {
  15: 5,
  30: 8,
  45: 12,
  60: 15,
};

export const MODE_LABELS: Record<LessonMode, string> = {
  interactive: "Interactive",
  gamified: "Gamified",
  quiz: "Quiz",
};
