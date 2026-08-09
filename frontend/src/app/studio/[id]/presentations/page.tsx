"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, assetUrl, type Lesson, type PresentationPage } from "@/lib/api";
import { approveStitchedDeck, getStitchedDeck } from "@/lib/studio-deck-store";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-black/[0.06] ${className}`} />;
}

function GeneratingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-12 text-center">
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
        aria-hidden
      />
      <p className="text-sm font-medium text-[var(--accent-strong)]">{label}</p>
      <p className="max-w-xs text-xs leading-5 text-[var(--ink-muted)]">
        OpenAI is writing the page and rendering the illustration. This can take a minute per scene.
      </p>
    </div>
  );
}

export default function PresentationsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params.id;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [loadingLesson, setLoadingLesson] = useState(true);

  const pages = useMemo(() => lesson?.presentation_pages ?? [], [lesson]);
  const selected: PresentationPage | null =
    pages.find((page) => page.scene_id === selectedId) ?? pages[0] ?? null;

  const counts = useMemo(() => {
    const presentation = pages.filter((p) => p.media_kind !== "video").length;
    const video = pages.filter((p) => p.media_kind === "video").length;
    const withImages = pages.filter((p) => Boolean(p.image_url)).length;
    return { presentation, video, withImages, total: pages.length };
  }, [pages]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingLesson(true);
      try {
        let data: Lesson | null = null;
        try {
          data = await api.getLesson(lessonId);
        } catch {
          data = null;
        }
        const cached = getStitchedDeck(lessonId);
        // Prefer live API pages; fall back to the approved localStorage stitch.
        if (cached && (!data?.presentation_pages?.length || cached.presentations_approved)) {
          if (!data) data = cached;
          else if (!data.presentation_pages?.length) {
            data = { ...data, presentation_pages: cached.presentation_pages };
          }
        }
        if (!data) {
          throw new Error("Lesson not found. Generate scenes in Studio first.");
        }
        if (cancelled) return;
        setLesson(data);
        setSelectedId(data.presentation_pages?.[0]?.scene_id ?? null);
        if (!data.scenes_approved) {
          setStatus("Scenes not approved yet — go back to Studio");
        } else if (data.presentation_pages?.length) {
          setStatus(`Loaded ${data.presentation_pages.length} presentation pages`);
        } else {
          setStatus("Ready to generate presentation pages");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load lesson");
          setStatus("Failed");
        }
      } finally {
        if (!cancelled) setLoadingLesson(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  async function generate() {
    setBusy(true);
    setError(null);
    setStatus("Generating paragraphs + OpenAI images… this can take a few minutes");
    try {
      const data = await api.generatePresentations(lessonId);
      setLesson(data);
      setSelectedId(data.presentation_pages?.[0]?.scene_id ?? null);
      const imageCount = data.presentation_pages?.filter((p) => p.image_url).length ?? 0;
      const total = data.presentation_pages?.length ?? 0;
      setStatus(`Generated ${total} pages (${imageCount} with images)`);
      if (total && imageCount === 0) {
        setError(
          "Text was generated, but OpenAI returned no images. Check OPENAI_API_KEY and OPENAI_IMAGE_MODEL=gpt-image-1.5 in backend/.env, then regenerate.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  function approveAndReturn() {
    if (!lesson?.presentation_pages?.length) {
      setError("Generate presentation pages before approving.");
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const deck = approveStitchedDeck(lesson);
      const images = deck.presentation_pages.filter((p) => p.image_url).length;
      const videos = deck.presentation_pages.filter((p) => p.media_kind === "video").length;
      setStatus(
        `Approved ${deck.presentation_pages.length} pages (${images} images, ${videos} video slots)`,
      );
      router.push(`/studio?approved=${encodeURIComponent(deck.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve presentation");
      setApproving(false);
    }
  }

  const imageSrc = assetUrl(selected?.image_url);
  const showGeneratingEmpty = busy && !pages.length;
  const showInitialLoading = loadingLesson && !lesson;
  const canApprove = Boolean(pages.length) && !busy && !approving && !loadingLesson;

  return (
    <div className="studio-shell mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/studio"
            className="inline-flex items-center gap-2 text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
          >
            <span aria-hidden>←</span>
            <span className="font-[family-name:var(--font-display)] tracking-wide">Lesson Studio</span>
          </Link>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Presentation pages
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)] sm:text-base">
            {lesson?.title ?? "Lesson"} — beautiful paragraphs and OpenAI images for
            presentation-tagged scenes. Video-tagged scenes wait for the Video page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-xs text-[var(--ink-muted)] sm:text-sm">
            {status}
          </p>
          <button
            type="button"
            disabled={busy || approving || loadingLesson || !lesson?.scenes_approved}
            onClick={() => generate()}
            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-white/90 disabled:opacity-45"
          >
            {busy ? "Generating…" : pages.length ? "Regenerate presentations" : "Generate presentations"}
          </button>
          <button
            type="button"
            disabled={!canApprove}
            onClick={approveAndReturn}
            className="rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-45"
          >
            {approving ? "Saving…" : "Approve & return to Studio"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-3 text-sm whitespace-pre-wrap text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {pages.length ? (
        <p className="mb-4 text-xs text-[var(--ink-muted)]">
          {counts.presentation} presentation · {counts.video} video placeholders · {counts.withImages}{" "}
          images
        </p>
      ) : null}

      <div className="grid flex-1 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-7">
        <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-sm">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Pages
          </p>
          {showInitialLoading || showGeneratingEmpty ? (
            <ul className="space-y-2 px-1 py-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="space-y-2 rounded-xl px-2 py-2">
                  <Skeleton className="h-2 w-8" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          ) : pages.length ? (
            <ul className="studio-scroll max-h-[70vh] space-y-1 overflow-y-auto">
              {pages.map((page, index) => {
                const active = selected?.scene_id === page.scene_id;
                return (
                  <li key={page.scene_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(page.scene_id)}
                      disabled={busy}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition disabled:opacity-60 ${
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "hover:bg-white/70"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-70">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium">{page.title}</span>
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold">
                        {page.media_kind === "video"
                          ? "Video later"
                          : page.image_url
                            ? "Ready"
                            : page.status === "text_only"
                              ? "Text only"
                              : "Presentation"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 py-6 text-sm text-[var(--ink-muted)]">
              Approve scenes in Studio, then generate presentation pages here.
            </p>
          )}
        </aside>

        <section className="relative min-h-[28rem] overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] backdrop-blur-sm">
          {busy ? (
            <div className="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-[var(--accent-soft)]">
              <div className="h-full w-1/3 animate-pulse bg-[var(--accent)]" />
            </div>
          ) : null}

          {showInitialLoading || showGeneratingEmpty ? (
            <article className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4 border-b border-[var(--line)] p-5 sm:p-7 lg:border-b-0 lg:border-r">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="flex min-h-[18rem] flex-col p-5 sm:p-7">
                <Skeleton className="mb-3 h-3 w-16" />
                <GeneratingPanel
                  label={
                    showGeneratingEmpty
                      ? "Generating text + OpenAI images…"
                      : "Loading lesson…"
                  }
                />
              </div>
            </article>
          ) : selected ? (
            <article className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="border-b border-[var(--line)] p-5 sm:p-7 lg:border-b-0 lg:border-r">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Presentation page
                </p>
                {busy ? (
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-8 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
                      {selected.headline}
                    </h2>
                    <div className="mt-5 space-y-4">
                      {selected.paragraphs.length ? (
                        selected.paragraphs.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="text-sm leading-7 text-[var(--ink-muted)] sm:text-base sm:leading-8"
                          >
                            {paragraph}
                          </p>
                        ))
                      ) : (
                        <GeneratingPanel label="Writing page text…" />
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex min-h-[18rem] flex-col p-5 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Image
                </p>
                {busy ? (
                  <div className="mt-3 flex flex-1">
                    <GeneratingPanel label="Creating OpenAI illustration…" />
                  </div>
                ) : imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageSrc}
                    alt={selected.headline}
                    className="mt-3 aspect-square w-full rounded-2xl object-cover"
                  />
                ) : (
                  <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                    {selected.media_kind === "video"
                      ? "Video scene — image skipped on this page"
                      : selected.status === "text_only"
                        ? "OpenAI image unavailable for this scene. Try Regenerate presentations."
                        : "Generate to create an OpenAI illustration"}
                  </div>
                )}
                {!busy && selected.image_prompt ? (
                  <p className="mt-3 text-[11px] leading-5 text-[var(--ink-muted)]">
                    Prompt · {selected.image_prompt}
                  </p>
                ) : null}
              </div>
            </article>
          ) : (
            <div className="flex h-full min-h-[28rem] flex-col justify-center px-6 py-16">
              <p className="font-[family-name:var(--font-display)] text-xl">No pages yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
                Click Generate presentations to create paragraphs and OpenAI images for each
                presentation-tagged scene.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
