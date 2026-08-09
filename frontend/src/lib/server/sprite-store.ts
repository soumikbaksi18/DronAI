import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Sheets live outside `public/` so writing one mid-session does not trip the dev
 * server's static file watcher; they are served back through a route handler.
 */
const SPRITE_DIR = path.join(process.cwd(), ".character-cache");

const ID_PATTERN = /^[a-f0-9]{32}$/;

export function spriteUrl(id: string): string {
  return `/api/character/sprite/${id}`;
}

export async function saveSprite(png: Buffer): Promise<string> {
  const id = createHash("sha256").update(png).digest("hex").slice(0, 32);
  await mkdir(SPRITE_DIR, { recursive: true });
  await writeFile(path.join(SPRITE_DIR, `${id}.png`), png);
  return id;
}

export async function readSprite(id: string): Promise<Buffer | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return await readFile(path.join(SPRITE_DIR, `${id}.png`));
  } catch {
    return null;
  }
}
