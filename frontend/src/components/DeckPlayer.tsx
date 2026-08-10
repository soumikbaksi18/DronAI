"use client";

import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { cannedCharacterReply } from "@/lib/mock-generate";
import type { CharacterPose, Hotspot, LessonExperience } from "@/lib/types";
import { CharacterStage } from "./CharacterStage";

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
    setTarget({ x: 72, y: 84 });
  }

  function walkOnVisual(e: MouseEvent<HTMLElement>) {
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - bounds.left) / bounds.width) * 100;
    const y = ((e.clientY - bounds.top) / bounds.height) * 100;
    // Presenter pocket: lower-right of the visual panel only.
    if (x < 42 || y < 55) return;
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
  const sceneLabel = scene.type.replace(/_/g, " ");

  return (
    <div className="deck-player flex min-h-0 flex-1 flex-col">
      {showChrome ? (
        <header className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4 px-4 pb-3 pt-1 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[0.68rem] font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
              Interactive classroom
            </p>
            <p className="mt-0.5 truncate font-[family-name:var(--font-display)] text-sm text-[var(--foreground)] sm:text-base">
              {lesson.title}
            </p>
          </div>
          <p className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs tabular-nums text-[var(--ink-muted)] ring-1 ring-[var(--line)]">
            Slide <span className="font-semibold text-[var(--foreground)]">{index + 1}</span>
            <span className="mx-1 text-[var(--line)]">/</span>
            {total}
          </p>
        </header>
      ) : null}

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-5 sm:px-6">
        <article
          key={scene.id}
          className="deck-slide relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.6rem] bg-[var(--surface-solid)] shadow-[var(--shadow-soft)] ring-1 ring-[var(--line)] animate-fade-up lg:min-h-[min(68vh,640px)]"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
            {/* Copy column */}
            <div className="relative flex min-h-0 flex-col border-b border-[var(--line)] lg:border-r lg:border-b-0">
              <div className="studio-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-9 sm:py-8">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[0.65rem] font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
                    {sceneLabel}
                  </span>
                  <span className="text-[0.7rem] text-[var(--ink-muted)]">
                    {lesson.character.name} can help with this slide
                  </span>
                </div>

                <h1 className="max-w-[22ch] break-words font-[family-name:var(--font-display)] text-[1.65rem] leading-[1.15] font-semibold tracking-tight text-[var(--foreground)] sm:text-[2rem] lg:text-[2.25rem]">
                  {scene.title}
                </h1>

                <p className="mt-5 max-w-prose break-words text-[0.98rem] leading-7 whitespace-pre-line text-[var(--ink-muted)] sm:text-base sm:leading-8">
                  {scene.body}
                </p>

                {scene.hotspots.length ? (
                  <div className="mt-8 flex flex-wrap gap-2">
                    {scene.hotspots.map((hs) => {
                      const active = hs.id === activeHotspot?.id;
                      return (
                        <button
                          key={hs.id}
                          type="button"
                          onClick={() => selectHotspot(hs)}
                          className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${
                            active
                              ? "bg-[var(--accent)] text-white shadow-sm"
                              : "bg-white text-[var(--accent)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]"
                          }`}
                        >
                          {hs.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Visual / presenter column */}
            <div
              onClick={walkOnVisual}
              className="deck-visual relative min-h-[240px] cursor-default overflow-hidden bg-[#dfeae3] lg:min-h-0"
            >
              {media ? (
                media.type === "video" ? (
                  <video
                    src={media.url}
                    controls
                    className="absolute inset-0 h-full w-full object-cover"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.url}
                    alt={media.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#e7f2ec_0%,#f3efe6_100%)] px-8 text-center">
                  <p className="max-w-xs text-sm leading-6 text-[var(--ink-muted)]">
                    No slide image yet. Regenerate presentations, approve the deck, then publish
                    again.
                  </p>
                </div>
              )}

              {/* Soft veil so the guide stays readable over busy images */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-[linear-gradient(180deg,transparent_0%,rgba(16,40,32,0.18)_55%,rgba(16,40,32,0.34)_100%)]"
              />

              <CharacterStage
                character={lesson.character}
                pose={pose}
                speech={speech}
                target={target}
                className="z-20"
              />
            </div>
          </div>
        </article>

        {/* Control dock */}
        <div className="mt-4 rounded-2xl bg-white/75 p-3 shadow-sm ring-1 ring-[var(--line)] backdrop-blur-sm sm:p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent-soft)] disabled:opacity-35"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index >= total - 1}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-35"
              >
                Next
              </button>
            </div>

            <div className="flex flex-1 items-center justify-center gap-1.5 px-2">
              {lesson.scenes.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => go(i)}
                  className={`h-1.5 rounded-full transition ${
                    i === index
                      ? "w-7 bg-[var(--accent)]"
                      : "w-1.5 bg-[var(--foreground)]/15 hover:bg-[var(--foreground)]/30"
                  }`}
                />
              ))}
            </div>

            <form onSubmit={submitAsk} className="flex w-full gap-2 lg:max-w-md lg:flex-1">
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder={`Ask ${lesson.character.name} about this slide…`}
                className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
              >
                Ask
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
