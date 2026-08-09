import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Locally: sheets live outside `public/` so writing one mid-session does not
 * trip the dev server's static file watcher.
 *
 * On Vercel / serverless: the deploy filesystem is read-only — use `/tmp`.
 * Sheets are still served through the route handler. Note: `/tmp` is ephemeral
 * per instance, so a cold start may 404 a previously generated sprite URL.
 */
function spriteDir(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "character-cache");
  }
  return path.join(process.cwd(), ".character-cache");
}

const ID_PATTERN = /^[a-f0-9]{32}$/;

export function spriteUrl(id: string): string {
  return `/api/character/sprite/${id}`;
}

export async function saveSprite(png: Buffer): Promise<string> {
  const id = createHash("sha256").update(png).digest("hex").slice(0, 32);
  const dir = spriteDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.png`), png);
  return id;
}

export async function readSprite(id: string): Promise<Buffer | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return await readFile(path.join(spriteDir(), `${id}.png`));
  } catch {
    return null;
  }
}
