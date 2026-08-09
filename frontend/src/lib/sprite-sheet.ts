import type { CharacterSprite, SpriteFrameRole } from "./types";

export type SpriteFrame = {
  /** Tight bounds of the pose inside the sheet. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Horizontal centre of the pose's feet, relative to `x`. Anchoring on the feet
   * rather than the box keeps the body still when an outstretched arm widens the
   * bounding box.
   */
  footX: number;
};

export type LoadedSpriteSheet = {
  image: HTMLImageElement;
  frames: Map<SpriteFrameRole, SpriteFrame>;
  /** Tallest pose, so every pose can share one on-screen scale. */
  unitHeight: number;
  /** Direction the drawn art faces; poses are mirrored when heading the other way. */
  baseFacing: 1 | -1;
};

/** Ignore the faint halo the image model leaves around a transparent cutout. */
const ALPHA_THRESHOLD = 32;
/** A scanline needs more than this many solid pixels to count as occupied. */
const NOISE_FLOOR = 2;

type Span = [start: number, end: number];

function spansOf(counts: Uint32Array, minLength: number): Span[] {
  const spans: Span[] = [];
  let start = -1;

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > NOISE_FLOOR) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      spans.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) spans.push([start, counts.length]);

  return spans.filter(([a, b]) => b - a >= minLength);
}

/** Merge the closest neighbours until only `target` spans remain. */
function mergeToCount(spans: Span[], target: number): Span[] {
  const out = spans.slice();
  while (out.length > target) {
    let bestIndex = 0;
    let bestGap = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1][0] - out[i][1];
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }
    out.splice(bestIndex, 2, [out[bestIndex][0], out[bestIndex + 1][1]]);
  }
  return out;
}

/** Split the widest span at its thinnest interior column until `target` spans exist. */
function splitToCount(spans: Span[], counts: Uint32Array, target: number): Span[] {
  const out = spans.slice();
  while (out.length < target) {
    let widest = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i][1] - out[i][0] > out[widest][1] - out[widest][0]) widest = i;
    }
    const [start, end] = out[widest];
    const margin = Math.floor((end - start) * 0.25);
    const from = start + margin;
    const to = end - margin;
    if (to - from < 2) break;

    let cut = from;
    for (let i = from; i < to; i++) {
      if (counts[i] < counts[cut]) cut = i;
    }
    out.splice(widest, 1, [start, cut], [cut, end]);
    out.sort((a, b) => a[0] - b[0]);
  }
  return out;
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * The image model spaces the poses evenly by eye, not on an exact pixel grid, so
 * slicing the sheet into equal cells cuts characters in half. Projecting the
 * alpha channel onto each axis finds where the poses actually sit.
 */
function segment(
  alpha: Uint8Array,
  width: number,
  height: number,
  cols: number,
  rows: number,
): Box[] {
  const rowCounts = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[offset + x] > ALPHA_THRESHOLD) count++;
    }
    rowCounts[y] = count;
  }

  let bands = spansOf(rowCounts, Math.floor(height * 0.04));
  if (bands.length === 0) return [];
  if (bands.length > rows) bands = mergeToCount(bands, rows);
  if (bands.length < rows) bands = splitToCount(bands, rowCounts, rows);

  const boxes: Box[] = [];

  for (const [top, bottom] of bands) {
    const colCounts = new Uint32Array(width);
    for (let y = top; y < bottom; y++) {
      const offset = y * width;
      for (let x = 0; x < width; x++) {
        if (alpha[offset + x] > ALPHA_THRESHOLD) colCounts[x]++;
      }
    }

    let columns = spansOf(colCounts, Math.floor(width * 0.015));
    if (columns.length === 0) continue;
    if (columns.length > cols) columns = mergeToCount(columns, cols);
    if (columns.length < cols) columns = splitToCount(columns, colCounts, cols);

    for (const [left, right] of columns) {
      // The band spans the tallest pose in the row; trim to this pose alone.
      let poseTop = bottom;
      let poseBottom = top;
      for (let y = top; y < bottom; y++) {
        const offset = y * width;
        for (let x = left; x < right; x++) {
          if (alpha[offset + x] > ALPHA_THRESHOLD) {
            if (y < poseTop) poseTop = y;
            if (y >= poseBottom) poseBottom = y + 1;
            break;
          }
        }
      }
      if (poseBottom <= poseTop) continue;
      boxes.push({ x: left, y: poseTop, w: right - left, h: poseBottom - poseTop });
    }
  }

  return boxes;
}

function footCentre(alpha: Uint8Array, width: number, box: Box): number {
  const from = box.y + Math.floor(box.h * 0.82);
  let min = box.x + box.w;
  let max = box.x;

  for (let y = from; y < box.y + box.h; y++) {
    const offset = y * width;
    for (let x = box.x; x < box.x + box.w; x++) {
      if (alpha[offset + x] > ALPHA_THRESHOLD) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }

  if (max < min) return box.w / 2;
  return (min + max) / 2 - box.x;
}

function centroidX(
  alpha: Uint8Array,
  width: number,
  box: Box,
  fromRatio: number,
  toRatio: number,
): number | null {
  let total = 0;
  let count = 0;

  for (let y = box.y + Math.floor(box.h * fromRatio); y < box.y + box.h * toRatio; y++) {
    const offset = y * width;
    for (let x = box.x; x < box.x + box.w; x++) {
      if (alpha[offset + x] > ALPHA_THRESHOLD) {
        total += x - box.x;
        count++;
      }
    }
  }

  return count ? total / count : null;
}

/**
 * The image model ignores the requested facing about as often as it honours it,
 * so the direction is measured from the art. The pointing pose is the clearest
 * signal: the extended arm juts out on the side the character faces. Failing
 * that, a walking figure's head leads its feet.
 */
function detectBaseFacing(
  alpha: Uint8Array,
  width: number,
  frames: Map<SpriteFrameRole, SpriteFrame>,
): 1 | -1 {
  const point = frames.get("point");
  if (point) {
    const left = point.footX;
    const right = point.w - point.footX;
    if (left > right * 1.25) return -1;
    if (right > left * 1.25) return 1;
  }

  const walk = frames.get("walkA") ?? frames.get("walkB");
  if (walk) {
    const head = centroidX(alpha, width, walk, 0, 0.2);
    const feet = centroidX(alpha, width, walk, 0.75, 1);
    if (head !== null && feet !== null) {
      const lead = head - feet;
      if (lead < -walk.w * 0.04) return -1;
      if (lead > walk.w * 0.04) return 1;
    }
  }

  return 1;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load sprite sheet: ${url}`));
    image.src = url;
  });
}

async function analyse(sprite: CharacterSprite): Promise<LoadedSpriteSheet> {
  const image = await loadImage(sprite.url);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

  const expected = sprite.cols * sprite.rows;
  let boxes = segment(alpha, width, height, sprite.cols, sprite.rows);

  if (boxes.length !== expected) {
    const cellW = Math.floor(width / sprite.cols);
    const cellH = Math.floor(height / sprite.rows);
    boxes = Array.from({ length: expected }, (_, i) => ({
      x: (i % sprite.cols) * cellW,
      y: Math.floor(i / sprite.cols) * cellH,
      w: cellW,
      h: cellH,
    }));
  }

  const frames = new Map<SpriteFrameRole, SpriteFrame>();
  boxes.forEach((box, i) => {
    const role = sprite.frames[i];
    if (!role || frames.has(role)) return;
    frames.set(role, { ...box, footX: footCentre(alpha, width, box) });
  });

  const unitHeight = boxes.reduce((tallest, box) => Math.max(tallest, box.h), 1);

  return { image, frames, unitHeight, baseFacing: detectBaseFacing(alpha, width, frames) };
}

const cache = new Map<string, Promise<LoadedSpriteSheet>>();

export function loadSpriteSheet(sprite: CharacterSprite): Promise<LoadedSpriteSheet> {
  const existing = cache.get(sprite.url);
  if (existing) return existing;

  const pending = analyse(sprite).catch((error) => {
    cache.delete(sprite.url);
    throw error;
  });
  cache.set(sprite.url, pending);
  return pending;
}

/** Falls back through the pose list so a partially detected sheet still animates. */
export function pickFrame(
  sheet: LoadedSpriteSheet,
  ...roles: SpriteFrameRole[]
): SpriteFrame | null {
  for (const role of roles) {
    const frame = sheet.frames.get(role);
    if (frame) return frame;
  }
  return sheet.frames.values().next().value ?? null;
}
