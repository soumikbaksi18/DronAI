import {
  CharacterGenerationError,
  SHEET_COLS,
  SHEET_FRAMES,
  SHEET_ROWS,
  designCharacterConcept,
  renderCharacterSheet,
} from "@/lib/server/openai-character";
import { saveSprite, spriteUrl } from "@/lib/server/sprite-store";
import type { LessonCharacter } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let body: { title?: unknown; sourceText?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const sourceText = typeof body.sourceText === "string" ? body.sourceText : "";

  if (!title) {
    return Response.json({ error: "A lesson title is required" }, { status: 400 });
  }

  try {
    const concept = await designCharacterConcept({ title, sourceText });
    const sheet = await renderCharacterSheet(concept.appearance);
    const id = await saveSprite(sheet.png);

    const character: LessonCharacter = {
      name: concept.name,
      role: concept.role,
      palette: concept.palette,
      catchphrase: concept.catchphrase,
      poses: ["idle", "speak", "walk", "point"],
      appearance: concept.appearance,
      sprite: {
        url: spriteUrl(id),
        cols: SHEET_COLS,
        rows: SHEET_ROWS,
        frames: SHEET_FRAMES,
        model: sheet.model,
      },
    };

    return Response.json({ character });
  } catch (error) {
    const status = error instanceof CharacterGenerationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Character generation failed";
    console.error("[character/generate]", message);
    return Response.json({ error: message }, { status });
  }
}
