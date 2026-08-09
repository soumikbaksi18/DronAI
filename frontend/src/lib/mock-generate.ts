import { assetUrl, type PresentationPage, type Scene } from "./api";
import { getActiveStitchedDeck, listStitchedDecks } from "./studio-deck-store";
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
  // Keep hotspots on the text side so the guide can stay in the bottom-right image zone.
  return {
    id: `hs-${index}`,
    label: pick.prompt,
    x: 14 + (index % 2) * 22,
    y: 28 + (index % 3) * 12,
    prompt: pick.prompt,
    reply: pick.reply,
  };
}

/** Turn OpenAI presentation page images into deck assets the player can render. */
export function assetsFromPresentationPages(pages: PresentationPage[]): LessonAsset[] {
  const assets: LessonAsset[] = [];
  for (const page of pages) {
    const url = assetUrl(page.image_url);
    if (!url) continue;
    assets.push({
      id: `img-${page.scene_id}`,
      name: page.headline || page.title,
      type: "image",
      url,
      size: 0,
    });
  }
  return assets;
}

/** Attach approved presentation images to an older interactive deck that lacked them. */
export function withPresentationImages(lesson: LessonExperience): LessonExperience {
  const alreadyWired =
    lesson.assets.some((asset) => asset.type === "image") &&
    lesson.scenes.some((scene) => scene.mediaIds.length > 0);
  if (alreadyWired) return lesson;

  const deck =
    listStitchedDecks().find((item) => item.title === lesson.title) ?? getActiveStitchedDeck();
  const pages = deck?.presentation_pages ?? [];
  if (!pages.length) return lesson;

  const pageAssets = assetsFromPresentationPages(pages);
  if (!pageAssets.length) return lesson;

  const assets = [
    ...lesson.assets,
    ...pageAssets.filter((asset) => !lesson.assets.some((existing) => existing.id === asset.id)),
  ];
  const scenes = lesson.scenes.map((scene, index) => {
    if (scene.mediaIds.length) return scene;
    const page = pages.find((item) => item.scene_id === scene.id) ?? pages[index] ?? null;
    if (!page?.image_url) return scene;
    return { ...scene, mediaIds: [`img-${page.scene_id}`] };
  });

  return { ...lesson, assets, scenes, updatedAt: new Date().toISOString() };
}

function buildScenesFromPresentationPages(
  title: string,
  pages: PresentationPage[],
): DeckScene[] {
  return pages.map((page, i) => {
    const body =
      page.paragraphs?.filter(Boolean).join("\n\n").slice(0, 520) ||
      page.headline ||
      page.title;
    const sceneTitle = page.headline || page.title || `Scene ${i + 1}`;
    const type: SceneType =
      i === 0 ? "title" : i === pages.length - 1 && pages.length > 1 ? "summary" : "concept";
    const mediaId = page.image_url ? `img-${page.scene_id}` : undefined;

    return {
      id: page.scene_id || `scene-${i + 1}`,
      type,
      title: i === 0 && type === "title" ? title || sceneTitle : sceneTitle,
      body:
        type === "title"
          ? body || `An interactive classroom deck · ${pages.length} scenes`
          : body,
      hotspots:
        type === "concept" || type === "summary"
          ? [hotspotFor(sceneTitle, i)].slice(0, 1)
          : [],
      mediaIds: mediaId ? [mediaId] : [],
    };
  });
}

function buildScenesFromBackendScenes(
  title: string,
  backendScenes: Scene[],
  pages: PresentationPage[],
): DeckScene[] {
  const pageByScene = new Map(pages.map((page) => [page.scene_id, page]));
  return backendScenes.map((scene, i) => {
    const page = pageByScene.get(scene.id);
    const bullets = scene.slide?.bullets?.join(" · ") ?? "";
    const body =
      page?.paragraphs?.filter(Boolean).join("\n\n").slice(0, 520) ||
      scene.narration?.slice(0, 520) ||
      bullets ||
      scene.title;
    const sceneTitle = page?.headline || scene.slide?.headline || scene.title;
    const type: SceneType =
      i === 0 ? "title" : i === backendScenes.length - 1 && backendScenes.length > 1 ? "summary" : "concept";
    const mediaId = page?.image_url ? `img-${page.scene_id}` : undefined;

    return {
      id: scene.id,
      type,
      title: i === 0 && type === "title" ? title || sceneTitle : sceneTitle,
      body,
      hotspots: type === "concept" ? [hotspotFor(sceneTitle, i)] : [],
      mediaIds: mediaId ? [mediaId] : [],
    };
  });
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

    // Prefer attaching a presentation image whenever we have one — not only on "media" slides.
    const mediaIds =
      imageIds.length && (type === "media" || type === "concept" || type === "title")
        ? [imageIds[i % imageIds.length]]
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
      mediaIds,
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
  /** Approved OpenAI presentation pages — used for slide copy + images when present. */
  presentationPages?: PresentationPage[];
  /** Backend-planned scenes — preferred over chunking source text. */
  backendScenes?: Scene[];
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

  const pages = input.presentationPages ?? [];
  const pageAssets = assetsFromPresentationPages(pages);
  const assets = [
    ...input.assets,
    ...pageAssets.filter((asset) => !input.assets.some((existing) => existing.id === asset.id)),
  ];

  let scenes: DeckScene[];
  if (input.backendScenes?.length) {
    scenes = buildScenesFromBackendScenes(title, input.backendScenes, pages);
  } else if (pages.length) {
    scenes = buildScenesFromPresentationPages(title, pages);
  } else {
    const sceneCount = DURATION_SCENE_COUNTS[input.durationMin];
    scenes = buildScenes(title, sourceText, sceneCount, assets);
  }

  const now = new Date().toISOString();
  const id = `les-${Date.now().toString(36)}`;
  const slug = `${slugify(title)}-${shortId()}`;

  return {
    id,
    slug,
    title,
    durationMin: input.durationMin,
    mode: input.mode,
    assets,
    sourceText,
    character,
    scenes,
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
