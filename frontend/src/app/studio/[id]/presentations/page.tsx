"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, assetUrl, type Lesson, type PresentationPage } from "@/lib/api";

export default function PresentationsPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pages = lesson?.presentation_pages ?? [];
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
      try {
        const data = await api.getLesson(lessonId);
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
    setStatus("Generating paragraphs + images with OpenAI… this can take a few minutes");
    try {
      const data = await api.generatePresentations(lessonId);
      setLesson(data);
      setSelectedId(data.presentation_pages?.[0]?.scene_id ?? null);
      const imageCount = data.presentation_pages?.filter((p) => p.image_url).length ?? 0;
      setStatus(`Generated ${data.presentation_pages?.length ?? 0} pages (${imageCount} with images)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  const imageSrc = assetUrl(selected?.image_url);

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
            {lesson?.title ?? "Lesson"} — beautiful paragraphs and images for presentation-tagged
            scenes. Video-tagged scenes wait for the Video page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-xs text-[var(--ink-muted)] sm:text-sm">
            {status}
          </p>
          <button
            type="button"
            disabled={busy || !lesson?.scenes_approved}
            onClick={() => generate()}
            className="rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-45"
          >
            {busy ? "Generating…" : pages.length ? "Regenerate presentations" : "Generate presentations"}
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
          {pages.length ? (
            <ul className="studio-scroll max-h-[70vh] space-y-1 overflow-y-auto">
              {pages.map((page, index) => {
                const active = selected?.scene_id === page.scene_id;
                return (
                  <li key={page.scene_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(page.scene_id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "hover:bg-white/70"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-70">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium">{page.title}</span>
                      <span className="mt-1 inline-flex rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold">
                        {page.media_kind === "video" ? "Video later" : "Presentation"}
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

        <section className="min-h-[28rem] rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] backdrop-blur-sm">
          {selected ? (
            <article className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="border-b border-[var(--line)] p-5 sm:p-7 lg:border-b-0 lg:border-r">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Presentation page
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
                  {selected.headline}
                </h2>
                <div className="mt-5 space-y-4">
                  {selected.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7 text-[var(--ink-muted)] sm:text-base sm:leading-8"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex min-h-[18rem] flex-col p-5 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Image
                </p>
                {imageSrc ? (
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
                        ? "No image yet (generation may have failed or is still pending)"
                        : "Generate to create an illustration"}
                  </div>
                )}
                {selected.image_prompt ? (
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
