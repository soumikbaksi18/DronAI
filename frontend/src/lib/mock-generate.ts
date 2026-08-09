import type {
  Hotspot,
  LessonAsset,
  LessonCharacter,
  LessonExperience,
  LessonMode,
  DeckScene,
  SceneType,
} from "./types";
import { DURATION_SCENE_COUNTS } from "./types";
import { generateCharacter } from "./character-client";

const SAMPLE_SOURCE = `## The Indian Independence Movement

The struggle for independence involved many leaders, movements, and milestones.

### Non-Cooperation
Gandhi called for boycotts of British institutions and goods. Students, lawyers, and traders joined peaceful protests across the country.

### Civil Disobedience
The Salt March became a powerful symbol of resistance. Ordinary people broke unjust laws and demanded dignity.

### Quit India
In 1942, the demand for immediate independence intensified. Mass mobilization reshaped the political landscape.

### Partition and Freedom
Independence arrived with celebration and deep sorrow. Understanding both joy and loss helps students grasp the full story.`;

const GENERATE_STAGES = [
  "Reading materials…",
  "Building scenes for your lecture…",
  "Drawing your character map — this takes a moment…",
  "Assembling shareable deck…",
] as const;

export { GENERATE_STAGES };

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "lesson";
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function assetTypeFromName(name: string): LessonAsset["type"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "docx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
  return "other";
}

export function fakeExtractFromAssets(assets: LessonAsset[], fallbackTitle: string): string {
  if (assets.length === 0) {
    return SAMPLE_SOURCE.replace("The Indian Independence Movement", fallbackTitle || "Untitled Lesson");
  }

  const names = assets.map((a) => a.name).join(", ");
  return `## ${fallbackTitle || "Lesson from uploads"}

Extracted (mock) from: ${names}

### Key ideas
The uploaded materials outline the main concepts for this lecture. Each section below becomes a classroom scene.

### Deep dive
Students will explore cause and effect, primary examples, and why this topic still matters.

### Practice moment
A short interactive checkpoint helps learners check understanding before moving on.

### Wrap-up
Summarize the big idea and invite one question from the class.`;
}

/** Used only when the character map could not be generated. */
function fallbackCharacter(title: string): LessonCharacter {
  const word =
    title
      .split(/\s+/)
      .find((w) => w.length > 3)
      ?.replace(/[^a-zA-Z]/g, "") || "Guru";
  const name = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase().slice(0, 10);

  return {
    name: name.length > 2 ? name : "Azad",
    role: "Classroom Guide",
    palette: ["#0f6a5a", "#f6f3ec", "#1c2421"],
    catchphrase: "Let's walk through this idea together.",
    poses: ["idle", "speak", "walk"],
    sprite: null,
  };
}

function chunkParagraphs(text: string): string[] {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim() || "Untitled content"];
}

function hotspotFor(sceneTitle: string, index: number): Hotspot {
  const replies = [
    {
      prompt: "Why does this matter?",
      reply: `"${sceneTitle}" matters because it connects what we read to how people lived and chose. Tap another hotspot or ask me anything.`,
    },
    {
      prompt: "Explain simply",
      reply: `In simple words: ${sceneTitle} is one building block of the bigger story. Master this, then the next slide clicks into place.`,
    },
    {
      prompt: "हिंदी में समझाओ",
      reply: `मैं सरल हिंदी में समझाता/समझाती हूँ: "${sceneTitle}" इस पाठ का एक महत्वपूर्ण हिस्सा है। (Mock — Sarvam voice later.)`,
    },
  ];
  const pick = replies[index % replies.length];
  return {
    id: `hs-${index}`,
    label: pick.prompt,
    x: 18 + (index % 3) * 28,
    y: 42 + (index % 2) * 18,
    prompt: pick.prompt,
    reply: pick.reply,
  };
}

const SCENE_PATTERN: SceneType[] = [
  "title",
  "concept",
  "character",
  "media",
  "concept",
  "checkpoint",
  "concept",
  "character",
  "media",
  "concept",
  "checkpoint",
  "concept",
  "character",
  "concept",
  "summary",
];

function buildScenes(
  title: string,
  sourceText: string,
  count: number,
  assets: LessonAsset[],
): DeckScene[] {
  const chunks = chunkParagraphs(sourceText);
  const imageIds = assets.filter((a) => a.type === "image" || a.type === "video").map((a) => a.id);
  const scenes: DeckScene[] = [];

  for (let i = 0; i < count; i++) {
    const type = i === count - 1 && count > 1 ? "summary" : SCENE_PATTERN[i % SCENE_PATTERN.length];
    const chunk = chunks[i % chunks.length];
    const line = chunk.split("\n")[0]?.slice(0, 72) || `Scene ${i + 1}`;
    const sceneTitle =
      type === "title"
        ? title
        : type === "summary"
          ? "What we learned"
          : type === "character"
            ? "Meet your guide"
            : type === "checkpoint"
              ? "Quick check"
              : line;

    const hotspots =
      type === "concept" || type === "checkpoint"
        ? [hotspotFor(sceneTitle, i), hotspotFor(sceneTitle, i + 1)].slice(0, type === "checkpoint" ? 2 : 1)
        : type === "character"
          ? [hotspotFor(sceneTitle, i)]
          : [];

    scenes.push({
      id: `scene-${i + 1}`,
      type,
      title: sceneTitle,
      body:
        type === "title"
          ? `An interactive classroom deck · ${count} scenes`
          : type === "summary"
            ? `We covered the core ideas in "${title}". Revisit any hotspot, or ask your guide one more question.`
            : type === "character"
              ? chunk.slice(0, 280)
              : type === "checkpoint"
                ? "Tap a hotspot to check your understanding. Your guide will respond."
                : chunk.slice(0, 420),
      hotspots,
      mediaIds: type === "media" && imageIds.length ? [imageIds[i % imageIds.length]] : [],
    });
  }

  return scenes;
}

export type GenerateInput = {
  title: string;
  durationMin: 15 | 30 | 45 | 60;
  mode: LessonMode;
  assets: LessonAsset[];
  sourceText?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runMockGenerate(
  input: GenerateInput,
  onStage?: (stage: string, index: number) => void,
  onWarning?: (message: string) => void,
): Promise<LessonExperience> {
  const title = input.title.trim() || "Untitled Lesson";
  const sourceText = input.sourceText?.trim() || fakeExtractFromAssets(input.assets, title);

  onStage?.(GENERATE_STAGES[0], 0);
  await delay(1100);

  onStage?.(GENERATE_STAGES[1], 1);
  await delay(1100);

  // Scenes are still stubbed, but the guide is a real generated character.
  onStage?.(GENERATE_STAGES[2], 2);
  let character: LessonCharacter;
  try {
    character = await generateCharacter({ title, sourceText });
  } catch (error) {
    character = fallbackCharacter(title);
    onWarning?.(
      error instanceof Error
        ? `${error.message} — falling back to the placeholder guide.`
        : "Character generation failed — falling back to the placeholder guide.",
    );
  }

  onStage?.(GENERATE_STAGES[3], 3);
  await delay(700);

  const sceneCount = DURATION_SCENE_COUNTS[input.durationMin];
  const now = new Date().toISOString();
  const id = `les-${Date.now().toString(36)}`;
  const slug = `${slugify(title)}-${shortId()}`;

  return {
    id,
    slug,
    title,
    durationMin: input.durationMin,
    mode: input.mode,
    assets: input.assets,
    sourceText,
    character,
    scenes: buildScenes(title, sourceText, sceneCount, input.assets),
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };
}

export function cannedCharacterReply(
  question: string,
  character: LessonCharacter,
  sceneTitle?: string,
): string {
  const q = question.trim().toLowerCase();
  if (!q) return character.catchphrase;
  if (q.includes("hindi") || q.includes("हिंदी")) {
    return `नमस्ते! मैं ${character.name} हूँ। ${sceneTitle ? `"${sceneTitle}"` : "यह विषय"} को हम साथ में समझेंगे।`;
  }
  if (q.includes("example") || q.includes("उदाहरण")) {
    return `Here's a quick example for ${sceneTitle ?? "this idea"}: picture one concrete moment from the materials, then explain it in one sentence.`;
  }
  if (q.includes("simple") || q.includes("simplify") || q.includes("explain")) {
    return `Simply put: ${sceneTitle ?? "this section"} is one clear step in the bigger lesson. Stay with me and we'll stack the next idea.`;
  }
  if (q.includes("why")) {
    return `Because understanding ${sceneTitle ?? "this"} helps you teach—and learn—with confidence. ${character.catchphrase}`;
  }
  return `${character.name} here: I heard "${question.slice(0, 80)}". ${character.catchphrase} (Mock reply — wire LLM later.)`;
}

export { SAMPLE_SOURCE };
