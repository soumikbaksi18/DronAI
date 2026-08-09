export type LessonMode = "interactive" | "gamified" | "quiz";

export type LessonStatus = "draft" | "generating" | "ready";

export type CharacterPose = "idle" | "speak" | "walk" | "point";

/** One cell of the generated character map, in reading order. */
export type SpriteFrameRole = "idle" | "walkA" | "walkB" | "talk" | "point" | "back";

/** Reading order of the 3x2 character map we ask the image model for. */
export const SPRITE_FRAME_ORDER: SpriteFrameRole[] = [
  "idle",
  "walkA",
  "walkB",
  "talk",
  "point",
  "back",
];

export type CharacterSprite = {
  /** Served from /api/character/sprite/<id> */
  url: string;
  cols: number;
  rows: number;
  /** Role of each cell, in reading order. Length is cols * rows. */
  frames: SpriteFrameRole[];
  model: string;
};

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

/** Interactive deck slide — distinct from API `Scene` in api.ts */
export type DeckScene = {
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
  /** Wardrobe/build description the image model was given. */
  appearance?: string;
  /** Null when image generation was unavailable and the vector fallback is used. */
  sprite?: CharacterSprite | null;
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
  scenes: DeckScene[];
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
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
