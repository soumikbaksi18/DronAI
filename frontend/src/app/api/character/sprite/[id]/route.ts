import { readSprite } from "@/lib/server/sprite-store";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/character/sprite/[id]">) {
  const { id } = await ctx.params;
  const png = await readSprite(id.replace(/\.png$/, ""));

  if (!png) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // The id is a content hash, so a sheet at a given URL never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
