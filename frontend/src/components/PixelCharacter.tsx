"use client";

import type { CharacterPose, LessonCharacter } from "@/lib/types";

type Props = {
  character: LessonCharacter;
  pose?: CharacterPose;
  speech?: string | null;
  className?: string;
};

export function PixelCharacter({
  character,
  pose = "idle",
  speech,
  className = "",
}: Props) {
  const [c0, c1, c2] = character.palette;
  const bounce =
    pose === "speak" ? "animate-character-speak" : pose === "walk" ? "animate-character-walk" : "animate-character-idle";

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {speech ? (
        <div className="mb-3 max-w-[220px] rounded-2xl bg-white/95 px-3 py-2 text-xs leading-5 text-[var(--foreground)] shadow-sm ring-1 ring-black/5">
          {speech}
        </div>
      ) : null}
      <svg
        viewBox="0 0 64 80"
        width="96"
        height="120"
        className={`${bounce} drop-shadow-sm`}
        style={{ imageRendering: "pixelated" }}
        aria-label={`${character.name}, ${character.role}`}
      >
        {/* legs */}
        <rect x="22" y="58" width="8" height="16" fill={c2} />
        <rect x="34" y="58" width="8" height="16" fill={c2} />
        {/* body */}
        <rect x="18" y="34" width="28" height="26" fill={c0} />
        {/* arms */}
        <rect
          x="10"
          y="36"
          width="8"
          height="18"
          fill={c0}
          className={pose === "speak" ? "origin-top" : undefined}
        />
        <rect x="46" y="36" width="8" height="18" fill={c0} />
        {/* head */}
        <rect x="20" y="10" width="24" height="22" fill={c1} stroke={c2} strokeWidth="2" />
        {/* eyes */}
        <rect x="26" y="18" width="4" height="4" fill={c2} />
        <rect x="36" y="18" width="4" height="4" fill={c2} />
        {/* smile */}
        <rect x="28" y="26" width="10" height="2" fill={c0} />
        {/* hat / accent */}
        <rect x="18" y="6" width="28" height="6" fill={c0} />
      </svg>
      <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{character.name}</p>
      <p className="text-xs text-[var(--ink-muted)]">{character.role}</p>
    </div>
  );
}
