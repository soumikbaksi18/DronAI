"use client";

import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { cannedCharacterReply } from "@/lib/mock-generate";
import type { CharacterPose, Hotspot, LessonExperience } from "@/lib/types";
import { CharacterStage } from "./CharacterStage";
import { HotspotLayer } from "./HotspotLayer";

type Props = {
  lesson: LessonExperience;
  showChrome?: boolean;
};

export function DeckPlayer({ lesson, showChrome = true }: Props) {
  const [index, setIndex] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [pose, setPose] = useState<CharacterPose>("idle");
  const [speech, setSpeech] = useState<string | null>(lesson.character.catchphrase);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [ask, setAsk] = useState("");

  const scene = lesson.scenes[index];
  const total = lesson.scenes.length;

  const go = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(total - 1, next)));
      setActiveHotspot(null);
      setPose("idle");
      setSpeech(null);
      // Releasing the target lets the guide roam the new slide on its own.
      setTarget(null);
    },
    [total],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  function selectHotspot(hs: Hotspot) {
    setActiveHotspot(hs);
    setPose("point");
    setSpeech(hs.reply);
    // Stay in the bottom-right presenter pocket; face toward the tapped hotspot.
    setTarget({
      x: hs.x < 50 ? 70 : 88,
      y: 82,
    });
  }

  function walkTo(e: MouseEvent<HTMLElement>) {
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - bounds.left) / bounds.width) * 100;
    const y = ((e.clientY - bounds.top) / bounds.height) * 100;
    // Only accept walk targets inside the bottom-right pocket of the slide.
    if (x < 58 || y < 62) return;
    setTarget({ x, y });
    setPose("idle");
  }

  function submitAsk(e: FormEvent) {
    e.preventDefault();
    if (!ask.trim()) return;
    setPose("speak");
    setSpeech(cannedCharacterReply(ask, lesson.character, scene?.title));
    setAsk("");
  }

  if (!scene) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ink-muted)]">
        No scenes in this lesson.
      </div>
    );
  }

  const media = lesson.assets.find((a) => scene.mediaIds.includes(a.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showChrome ? (
        <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
              GuruDroneAI · {lesson.mode}
            </p>
            <p className="truncate text-sm text-[var(--ink-muted)]">{lesson.title}</p>
          </div>
          <p className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
            {index + 1} / {total}
          </p>
        </header>
      ) : null}

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-4 sm:px-6">
        <article
          onClick={walkTo}
          className="relative flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#e7f2ec_0%,#f6f3ec_45%,#efe6d6_100%)] ring-1 ring-black/5"
        >
          <div className="relative grid flex-1 grid-cols-1 gap-6 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(240px,0.95fr)] lg:items-stretch lg:gap-8">
            <div className="relative z-10 flex min-w-0 flex-col">
              <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
                {scene.type}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl lg:text-4xl">
                {scene.title}
              </h1>
              <p className="mt-5 max-w-xl whitespace-pre-line text-base leading-7 text-[var(--ink-muted)] sm:text-lg sm:leading-8">
                {scene.body}
              </p>
            </div>

            <div className="relative min-h-[220px] overflow-hidden rounded-2xl bg-black/[0.04] ring-1 ring-black/5 lg:min-h-0">
              {media ? (
                media.type === "video" ? (
                  <video
                    src={media.url}
                    controls
                    className="h-full max-h-[420px] w-full object-cover lg:absolute lg:inset-0 lg:max-h-none"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.url}
                    alt={media.name}
                    className="h-full max-h-[420px] w-full object-cover lg:absolute lg:inset-0 lg:max-h-none"
                  />
                )
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm text-[var(--ink-muted)] lg:absolute lg:inset-0">
                  No slide image yet — approve &amp; regenerate presentations, then publish again.
                </div>
              )}
            </div>
          </div>

          {/* Both layers measure against the article, so a hotspot's percent
              position is the same spot the guide walks to. */}
          <CharacterStage
            character={lesson.character}
            pose={pose}
            speech={speech}
            target={target}
            className="z-20"
          />

          <HotspotLayer
            hotspots={scene.hotspots}
            activeId={activeHotspot?.id}
            onSelect={selectHotspot}
            className="z-30"
          />
        </article>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index >= total - 1}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>

          <form onSubmit={submitAsk} className="flex w-full max-w-md gap-2">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder={`Ask ${lesson.character.name}…`}
              className="flex-1 rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white"
            >
              Ask
            </button>
          </form>
        </div>

        <div className="mt-3 flex justify-center gap-1.5">
          {lesson.scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition ${
                i === index ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-black/15 hover:bg-black/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
