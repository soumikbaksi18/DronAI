import type { LessonCharacter } from "./types";

/**
 * Casts the guide and renders its character map. The image call takes roughly
 * half a minute, so callers should show progress while this runs.
 */
export async function generateCharacter(input: {
  title: string;
  sourceText: string;
}): Promise<LessonCharacter> {
  const res = await fetch("/api/character/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await res.json().catch(() => null)) as
    | { character?: LessonCharacter; error?: string }
    | null;

  if (!res.ok || !payload?.character) {
    throw new Error(payload?.error ?? `Character generation failed (${res.status})`);
  }

  return payload.character;
}
