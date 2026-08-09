"use client";

import { useEffect, useRef, useState } from "react";
import { loadSpriteSheet, pickFrame, type LoadedSpriteSheet, type SpriteFrame } from "@/lib/sprite-sheet";
import type { CharacterPose, LessonCharacter } from "@/lib/types";
import { PixelCharacter } from "./PixelCharacter";

type Point = { x: number; y: number };

type Props = {
  character: LessonCharacter;
  speech?: string | null;
  /** Percent coordinates within the stage that the guide should walk to. */
  target?: Point | null;
  pose?: CharacterPose;
  className?: string;
};

/** The strip of the slide the guide is allowed to roam, in percent. */
const ROAM = { minX: 10, maxX: 90, minY: 54, maxY: 86 };
const WALK_SPEED = 145; // css px per second
const STEP_LENGTH = 26; // px of travel between walk frames
const ARRIVE_EPSILON = 3;

type Motion = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  travelled: number;
  restUntil: number;
  seeded: boolean;
};

function percentToPixels(point: Point, width: number, height: number): Point {
  return { x: (point.x / 100) * width, y: (point.y / 100) * height };
}

export function CharacterStage({
  character,
  speech,
  target,
  pose = "idle",
  className = "",
}: Props) {
  const sprite = character.sprite ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const [sheet, setSheet] = useState<LoadedSpriteSheet | null>(null);
  const [failed, setFailed] = useState(false);

  const motion = useRef<Motion>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    facing: 1,
    travelled: 0,
    restUntil: 0,
    seeded: false,
  });

  // Mirrored into refs so the animation loop never has to be torn down and
  // rebuilt when a prop changes.
  const poseRef = useRef(pose);
  const speakingRef = useRef(false);
  const hasTargetRef = useRef(false);

  useEffect(() => {
    poseRef.current = pose;
    speakingRef.current = Boolean(speech);
    hasTargetRef.current = Boolean(target);
  }, [pose, speech, target]);

  const targetX = target?.x ?? null;
  const targetY = target?.y ?? null;

  useEffect(() => {
    if (!sprite) return;
    let cancelled = false;

    loadSpriteSheet(sprite)
      .then((loaded) => {
        if (!cancelled) setSheet(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [sprite]);

  // Walk to the spot the deck asked for, e.g. the hotspot a student just tapped.
  useEffect(() => {
    const container = containerRef.current;
    if (targetX === null || targetY === null || !container) return;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;

    const pixels = percentToPixels(
      {
        x: Math.min(Math.max(targetX, ROAM.minX), ROAM.maxX),
        y: Math.min(Math.max(targetY, ROAM.minY), ROAM.maxY),
      },
      width,
      height,
    );

    motion.current.targetX = pixels.x;
    motion.current.targetY = pixels.y;
    motion.current.restUntil = 0;
  }, [targetX, targetY]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !sheet) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let charHeight = 0;
    let frameHandle = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      height = container.clientHeight;
      charHeight = Math.max(92, Math.min(190, height * 0.3));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The sheet is a high-resolution render being scaled down, so smoothing
      // reads cleaner here than nearest-neighbour.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const state = motion.current;
      if (!state.seeded && width && height) {
        const start = percentToPixels({ x: 74, y: 76 }, width, height);
        state.x = start.x;
        state.y = start.y;
        state.targetX = start.x;
        state.targetY = start.y;
        state.seeded = true;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const draw = (now: number) => {
      frameHandle = requestAnimationFrame(draw);

      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!width || !height) return;

      const state = motion.current;
      let dx = state.targetX - state.x;
      let dy = state.targetY - state.y;
      let distance = Math.hypot(dx, dy);

      // With nothing else to do, the guide strolls to a new spot on the slide.
      if (distance <= ARRIVE_EPSILON && !hasTargetRef.current && !reduceMotion) {
        if (state.restUntil === 0) {
          state.restUntil = now + 2600 + Math.random() * 3200;
        } else if (now >= state.restUntil) {
          const next = percentToPixels(
            {
              x: ROAM.minX + Math.random() * (ROAM.maxX - ROAM.minX),
              y: ROAM.minY + Math.random() * (ROAM.maxY - ROAM.minY),
            },
            width,
            height,
          );
          state.targetX = next.x;
          state.targetY = next.y;
          state.restUntil = 0;
          dx = state.targetX - state.x;
          dy = state.targetY - state.y;
          distance = Math.hypot(dx, dy);
        }
      }

      const walking = distance > ARRIVE_EPSILON;

      if (walking) {
        if (reduceMotion) {
          state.x = state.targetX;
          state.y = state.targetY;
        } else {
          const step = Math.min(WALK_SPEED * delta, distance);
          state.x += (dx / distance) * step;
          state.y += (dy / distance) * step;
          state.travelled += step;
          if (Math.abs(dx) > 2) state.facing = dx > 0 ? 1 : -1;
        }
      }

      const moving = walking && !reduceMotion;
      const scale = charHeight / sheet.unitHeight;

      let frame: SpriteFrame | null;
      let flip = false;

      if (moving) {
        const step = Math.floor(state.travelled / STEP_LENGTH) % 2;
        frame = pickFrame(sheet, step === 0 ? "walkA" : "walkB", "idle");
        flip = state.facing !== sheet.baseFacing;
      } else if (poseRef.current === "point") {
        frame = pickFrame(sheet, "point", "talk", "idle");
        flip = state.facing !== sheet.baseFacing;
      } else if (speakingRef.current && !reduceMotion) {
        // Alternate between the talking and neutral poses to suggest speech.
        frame = pickFrame(sheet, Math.floor(now / 320) % 2 === 0 ? "talk" : "idle", "idle");
      } else {
        frame = pickFrame(sheet, "idle", "talk");
      }

      ctx.clearRect(0, 0, width, height);
      if (!frame) return;

      const bob = reduceMotion
        ? 0
        : moving
          ? Math.abs(Math.sin((state.travelled / STEP_LENGTH) * Math.PI)) * -2.5
          : Math.sin(now / 620) * 2;

      const drawWidth = frame.w * scale;
      const drawHeight = frame.h * scale;
      const feetX = state.x;
      const groundY = state.y;

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#13201b";
      ctx.beginPath();
      ctx.ellipse(feetX, groundY, drawWidth * 0.3, drawWidth * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(feetX, groundY + bob);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(
        sheet.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        -frame.footX * scale,
        -drawHeight,
        drawWidth,
        drawHeight,
      );
      ctx.restore();

      const bubble = bubbleRef.current;
      if (bubble) {
        const bubbleX = Math.min(Math.max(feetX, 120), Math.max(width - 120, 120));
        const bubbleY = groundY + bob - drawHeight - 12;
        bubble.style.transform = `translate3d(${bubbleX}px, ${bubbleY}px, 0) translate(-50%, -100%)`;
      }

      const label = labelRef.current;
      if (label) {
        label.style.transform = `translate3d(${feetX}px, ${groundY + 10}px, 0) translate(-50%, 0)`;
      }
    };

    frameHandle = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameHandle);
      observer.disconnect();
    };
  }, [sheet]);

  if (!sprite || failed) {
    return (
      <div
        className={`pointer-events-none absolute right-6 bottom-6 sm:right-10 sm:bottom-10 ${className}`}
      >
        <PixelCharacter character={character} pose={pose} speech={speech} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`pointer-events-none absolute inset-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`${character.name}, ${character.role}`}
      />

      <div
        ref={bubbleRef}
        aria-live="polite"
        className={`absolute top-0 left-0 max-w-[15rem] rounded-2xl bg-white/95 px-3 py-2 text-xs leading-5 text-[var(--foreground)] shadow-sm ring-1 ring-black/5 transition-opacity duration-200 ${
          speech ? "opacity-100" : "opacity-0"
        }`}
        style={{ willChange: "transform" }}
      >
        {speech}
      </div>

      <div
        ref={labelRef}
        className="absolute top-0 left-0 text-center whitespace-nowrap"
        style={{ willChange: "transform" }}
      >
        <p className="text-xs font-semibold text-[var(--foreground)]">{character.name}</p>
        <p className="text-[0.65rem] text-[var(--ink-muted)]">{character.role}</p>
      </div>

      {!sheet ? (
        <p className="absolute right-6 bottom-6 text-xs text-[var(--ink-muted)]">
          Waking up {character.name}…
        </p>
      ) : null}
    </div>
  );
}
