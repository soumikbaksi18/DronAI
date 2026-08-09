import "server-only";

import { SPRITE_FRAME_ORDER } from "@/lib/types";

const OPENAI_BASE = "https://api.openai.com/v1";

/** gpt-image-2 rejects `background: "transparent"`, which sprites require. */
const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

export const SHEET_COLS = 3;
export const SHEET_ROWS = 2;
const SHEET_SIZE = "1536x1024";

export type CharacterConcept = {
  name: string;
  role: string;
  catchphrase: string;
  appearance: string;
  palette: [string, string, string];
};

export class CharacterGenerationError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "CharacterGenerationError";
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new CharacterGenerationError("OPENAI_API_KEY is not configured", 500);
  }
  return key;
}

async function openai(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok || !json) {
    const detail =
      (json?.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new CharacterGenerationError(`OpenAI ${path} failed: ${detail}`, 502);
  }

  return json;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function normalisePalette(input: unknown): [string, string, string] {
  const fallback: [string, string, string] = ["#0c5c4d", "#f6f3ec", "#1c2421"];
  if (!Array.isArray(input)) return fallback;
  const picked = input.filter((c): c is string => typeof c === "string" && HEX.test(c));
  return [picked[0] ?? fallback[0], picked[1] ?? fallback[1], picked[2] ?? fallback[2]];
}

function clampLine(value: unknown, fallback: string, max: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text ? text.slice(0, max) : fallback;
}

/**
 * Ask a text model to cast a guide that belongs to the lesson's subject, so the
 * image prompt describes a specific person rather than a generic mascot.
 */
export async function designCharacterConcept(input: {
  title: string;
  sourceText: string;
}): Promise<CharacterConcept> {
  const json = await openai("/chat/completions", {
    model: process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "You cast a single guide character for a school lesson deck. The character must belong to the subject matter of the lesson: its era, culture, discipline and setting. Never invent robots, generic mascots or brand logos, and never depict a real identifiable living person.",
      },
      {
        role: "user",
        content: `Lesson title: ${input.title}

Lesson source material:
"""
${input.sourceText.slice(0, 4000)}
"""

Cast the guide who will walk students through this lesson.

- name: a short, warm first name that fits the subject's culture and period (one word).
- role: 2-4 words describing them in the classroom, e.g. "Freedom Movement Storyteller".
- catchphrase: one friendly sentence they say when a student opens the deck.
- appearance: 40-70 words of purely visual description for an artist — build, age, skin tone, hair, clothing, colours, and one signature prop they carry. Describe clothing and props tied to the lesson subject. No pose, no background, no camera direction.
- palette: exactly three hex colours sampled from that outfit, ordered primary, secondary, outline.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "character_concept",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["name", "role", "catchphrase", "appearance", "palette"],
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            catchphrase: { type: "string" },
            appearance: { type: "string" },
            palette: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  });

  const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) {
    throw new CharacterGenerationError("Character concept response was empty");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new CharacterGenerationError("Character concept was not valid JSON");
  }

  return {
    name: clampLine(parsed.name, "Guru", 24).split(" ")[0],
    role: clampLine(parsed.role, "Classroom Guide", 40),
    catchphrase: clampLine(parsed.catchphrase, "Let's walk through this idea together.", 160),
    appearance: clampLine(parsed.appearance, "a warm, friendly classroom guide", 600),
    palette: normalisePalette(parsed.palette),
  };
}

/**
 * The cells are described in the same order as SPRITE_FRAME_ORDER so the player
 * can map each slice of the sheet back to a pose.
 */
export function buildSheetPrompt(appearance: string): string {
  return `A character reference sprite sheet for a 2D video game, arranged as a strict grid of ${SHEET_COLS} columns and ${SHEET_ROWS} rows: ${SHEET_COLS * SHEET_ROWS} equal square cells in reading order.

The SAME single character appears in every cell, perfectly consistent in face, outfit, colours, proportions and scale.

Character: ${appearance}

Cell order:
1. Standing idle, facing the viewer, arms relaxed at the sides.
2. Walking, side profile facing RIGHT, left leg forward, arms swinging.
3. Walking, side profile facing RIGHT, right leg forward, arms swinging the other way.
4. Talking to the class, facing the viewer, mouth open mid-speech, one hand raised in an explaining gesture.
5. Pointing, facing the viewer, one arm fully extended pointing to the RIGHT.
6. Back view, walking away from the viewer.

Style: crisp 16-bit pixel art, chunky readable pixels, bold dark outline around the character, limited flat palette with simple cel shading. Full body visible in every cell, character centred in its own cell with the feet near the bottom of the cell and clear empty space between neighbouring cells.

Fully transparent background. No ground shadow, no floor, no scenery, no grid lines, no borders, no numbers, no text, no labels, no watermark. Nothing in the image except the six character poses.`;
}

export async function renderCharacterSheet(
  appearance: string,
): Promise<{ png: Buffer; model: string; prompt: string }> {
  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const prompt = buildSheetPrompt(appearance);

  const json = await openai("/images/generations", {
    model,
    prompt,
    size: SHEET_SIZE,
    quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
    background: "transparent",
    output_format: "png",
    n: 1,
  });

  const data = json.data as Array<{ b64_json?: string }> | undefined;
  const b64 = data?.[0]?.b64_json;
  if (!b64) {
    throw new CharacterGenerationError("Image response did not include a sprite sheet");
  }

  return { png: Buffer.from(b64, "base64"), model, prompt };
}

export const SHEET_FRAMES = SPRITE_FRAME_ORDER;
