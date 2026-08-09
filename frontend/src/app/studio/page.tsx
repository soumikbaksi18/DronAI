"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { api, assetUrl, type Lesson, type MdPart, type Scene, type SceneMediaKind } from "@/lib/api";
import { assetTypeFromName, runMockGenerate } from "@/lib/mock-generate";
import { saveLesson } from "@/lib/lesson-store";
import {
  getActiveStitchedDeck,
  getStitchedDeck,
  type StitchedDeck,
} from "@/lib/studio-deck-store";
import type { LessonAsset } from "@/lib/types";
import { MODE_LABELS } from "@/lib/types";

const SAMPLE_LESSON = `# What, Where, How and When?

## 1.1 Finding out about the past
There are several ways of finding out about the past. Historians use sources like inscriptions, manuscripts, and artefacts.

## 1.2 One past or many?
The past was different for different groups of people. The lives of kings were not the same as those of farmers or herders.

## 1.3 What do dates mean?
Dates are a convenient way to keep track of events, but they must be understood carefully when studying ancient history.

## 1.4 Historians and their sources
Manuscripts were often written on palm leaf or birch bark. Inscriptions are writings on hard surfaces such as stone or metal.`;

type InputMode = "upload" | "paste";
type ResultTab = "parts" | "scenes" | "command";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: string) {
  if (status === "Failed") return "danger";
  if (status === "Idle") return "muted";
  if (
    status.startsWith("Ready") ||
    status.includes("ready") ||
    status.includes("handled") ||
    status.includes("Approved")
  ) {
    return "ready";
  }
  return "busy";
}

function withMediaTags(scenes: Scene[]): (Scene & { media_kind: SceneMediaKind })[] {
  if (!scenes.length) return [];
  const alreadyTagged = scenes.every(
    (scene) => scene.media_kind === "presentation" || scene.media_kind === "video",
  );
  if (alreadyTagged) {
    return scenes.map((scene) => ({
      ...scene,
      media_kind: scene.media_kind === "video" ? "video" : "presentation",
    }));
  }

  // Fallback 80/20 if backend didn't send media_kind yet
  const videoCount = Math.max(scenes.length >= 5 ? 1 : 0, Math.round(scenes.length * 0.2));
  const scored = scenes
    .map((scene, index) => {
      const text = `${scene.title} ${scene.narration} ${scene.visual_prompt ?? ""}`.toLowerCase();
      let score = 0;
      for (const token of ["revolution", "battle", "war", "protest", "storm", "journey", "freedom"]) {
        if (text.includes(token)) score += 2;
      }
      score += Math.min((scene.visual_prompt ?? "").length, 120) / 80;
      return { index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const videoIndexes = new Set(scored.slice(0, videoCount).map((item) => item.index));

  return scenes.map((scene, index) => ({
    ...scene,
    media_kind: videoIndexes.has(index) ? "video" : "presentation",
  }));
}

function bootStitchedDeck(): StitchedDeck | null {
  if (typeof window === "undefined") return null;
  const approvedId = new URLSearchParams(window.location.search).get("approved");
  return approvedId ? getStitchedDeck(approvedId) : getActiveStitchedDeck();
}

function StudioPage() {
  const router = useRouter();
  const boot = useMemo(() => bootStitchedDeck(), []);
  const [title, setTitle] = useState(boot?.title ?? "What, Where, How and When?");
  const [sourceText, setSourceText] = useState(boot?.source_text || SAMPLE_LESSON);
  const [file, setFile] = useState<File | null>(null);
  const [sceneCount, setSceneCount] = useState(8);
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [resultTab, setResultTab] = useState<ResultTab>(boot ? "scenes" : "parts");
  const [lesson, setLesson] = useState<Lesson | null>(boot);
  const stitchedDeck = boot;
  const [parts, setParts] = useState<MdPart[]>(boot?.md_parts ?? []);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(boot?.md_parts?.[0]?.id ?? null);
  const [commandResult, setCommandResult] = useState<Record<string, unknown> | null>(null);
  const [command, setCommand] = useState("Guru, explain this in Hindi.");
  const [status, setStatus] = useState<string>(() => {
    if (!boot) return "Idle";
    const images = boot.presentation_pages.filter((p) => p.image_url).length;
    const videos = boot.presentation_pages.filter((p) => p.media_kind === "video").length;
    return `Approved presentation ready · ${boot.presentation_pages.length} pages · ${images} images · ${videos} video slots`;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [durationMin, setDurationMin] = useState<15 | 30 | 45 | 60>(30);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishStage, setPublishStage] = useState<string | null>(null);

  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? parts[0] ?? null;
  const tone = statusTone(status);
  const canRun = Boolean(file || (title.trim() && sourceText.trim()));
  const canApprove = Boolean(lesson?.scenes?.length && !lesson.scenes_approved);

  const workflowSteps = useMemo(
    () => [
      { id: "1", label: "Ingest" },
      { id: "2", label: "Split MD" },
      { id: "3", label: "Plan scenes" },
      { id: "4", label: "Approve" },
    ],
    [],
  );

  function pickFile(next: File | null) {
    setFile(next);
    if (next) setInputMode("upload");
  }

  async function ingestAndPlan() {
    setBusy(true);
    setError(null);
    setCommandResult(null);
    setResultTab("parts");

    try {
      let created: Lesson;
      if (file && inputMode === "upload") {
        setStatus("Uploading & splitting chapter…");
        created = await api.uploadLesson(file, {
          title: title.trim() || undefined,
          subject: "History",
          language: "en",
          scene_count: sceneCount,
        });
      } else {
        setStatus("Parsing Markdown into parts…");
        created = await api.createLesson({
          title,
          source_text: sourceText,
          subject: "History",
          language: "en",
          scene_count: sceneCount,
        });
      }

      setLesson(created);
      setParts(created.md_parts ?? []);
      setSelectedPartId(created.md_parts?.[0]?.id ?? null);
      setTitle(created.title);

      setStatus(`Planning ${sceneCount} classroom scenes…`);
      const generated = await api.generateLesson(created.id, sceneCount);
      setLesson(generated);
      setParts(generated.md_parts ?? created.md_parts ?? []);
      setStatus(`Scenes ready (${generated.scenes?.length ?? 0}) — review & approve`);
      setResultTab("scenes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveScenes() {
    if (!lesson) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Approving scenes…");
      const approved = await api.approveScenes(lesson.id);
      setLesson(approved);
      setStatus("Approved — opening presentation pages…");
      router.push(`/studio/${approved.id}/presentations`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand() {
    if (!lesson) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Sending classroom command…");
      const result = await api.classroomCommand(lesson.id, command, "hi");
      setCommandResult(result);
      setStatus("Command handled");
      setResultTab("command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishInteractiveDeck() {
    if (!lesson) return;
    setPublishBusy(true);
    setPublishError(null);
    setPublishStage(null);
    try {
      let warned: string | null = null;
      const assets: LessonAsset[] = [];
      if (file) {
        assets.push({
          id: `asset-${Date.now().toString(36)}`,
          name: file.name,
          type: assetTypeFromName(file.name),
          url: URL.createObjectURL(file),
          size: file.size,
        });
      }
      const presentationPages =
        stitchedDeck?.presentation_pages ?? lesson.presentation_pages ?? [];
      const experience = await runMockGenerate(
        {
          title: lesson.title || title,
          durationMin,
          mode: "interactive",
          assets,
          sourceText: lesson.source_text || sourceText,
          presentationPages,
          backendScenes: lesson.scenes?.length ? lesson.scenes : undefined,
        },
        (label) => setPublishStage(label),
        (message) => {
          warned = message;
          setPublishError(message);
        },
      );
      saveLesson(experience);
      setStatus("Interactive deck ready");
      // Give the teacher a beat to read why the guide is a placeholder.
      if (warned) await new Promise((resolve) => setTimeout(resolve, 2200));
      router.push(`/studio/${experience.id}/preview`);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Failed to publish deck");
    } finally {
      setPublishBusy(false);
    }
  }

  const canPublish = Boolean(lesson?.scenes?.length);

  return (
    <div className="studio-shell mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:pb-10">
      <header className="animate-fade-up mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
            >
              <span aria-hidden>←</span>
              <span className="font-[family-name:var(--font-display)] tracking-wide">Dashboard</span>
            </Link>
            <span className="text-[var(--line)]">·</span>
            <Link
              href="/studio/new"
              className="text-[var(--ink-muted)] transition hover:text-[var(--accent)]"
            >
              New interactive lesson
            </Link>
            <div className="ml-auto lg:hidden">
              <UserButton />
            </div>
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Lesson Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)] sm:text-base">
            Upload an NCERT chapter, split it into Markdown parts, plan classroom scenes, approve
            them for presentation pages, or publish an Interactive classroom deck.
          </p>
        </div>

        <div className="flex flex-col items-end gap-3 self-start">
          <div className="hidden lg:block">
            <UserButton />
          </div>
          <div
            className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs sm:text-sm ${
              tone === "danger"
                ? "border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)]"
                : tone === "ready"
                  ? "border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : tone === "busy"
                    ? "border-[var(--line)] bg-white/70 text-[var(--accent)]"
                    : "border-[var(--line)] bg-white/60 text-[var(--ink-muted)]"
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                tone === "danger"
                  ? "bg-[var(--danger)]"
                  : tone === "ready"
                    ? "bg-[var(--accent)]"
                    : tone === "busy"
                      ? "animate-pulse-soft bg-[var(--accent)]"
                      : "bg-[var(--ink-muted)]/50"
              }`}
            />
            <span className="truncate">{status}</span>
          </div>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2 sm:mb-6">
        {workflowSteps.map((step, index) => (
          <div
            key={step.id}
            className="animate-fade-up-delay flex items-center gap-2 text-xs text-[var(--ink-muted)]"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-mono text-[10px] text-[var(--accent)]">
              {step.id}
            </span>
            <span>{step.label}</span>
            {index < workflowSteps.length - 1 ? (
              <span className="mx-1 hidden text-[var(--line)] sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:gap-7 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Input column */}
        <section className="animate-fade-up space-y-4 lg:sticky lg:top-6 lg:self-start">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Lesson title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:bg-white"
              placeholder="e.g. The French Revolution"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Number of scenes</span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                value={sceneCount}
                onChange={(e) =>
                  setSceneCount(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
                }
                className="w-28 rounded-2xl border border-[var(--line)] bg-white/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:bg-white"
              />
              <p className="text-xs leading-5 text-[var(--ink-muted)]">
                Classroom scenes only on this page. Presentation pages come after approval.
              </p>
            </div>
          </label>

          <div className="flex rounded-2xl border border-[var(--line)] bg-white/50 p-1">
            {(
              [
                ["upload", "Upload chapter"],
                ["paste", "Paste Markdown"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setInputMode(mode)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm transition ${
                  inputMode === mode
                    ? "bg-[var(--foreground)] text-white"
                    : "text-[var(--ink-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {inputMode === "upload" ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) pickFile(dropped);
              }}
              className={`rounded-3xl border border-dashed px-4 py-8 text-center transition ${
                dragOver
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/60"
                  : "border-[var(--line)] bg-white/55 hover:border-[var(--accent)]/50"
              }`}
            >
              <p className="font-[family-name:var(--font-display)] text-lg">Drop your chapter here</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">PDF, Markdown, or TXT</p>
              <label className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]">
                Choose file
                <input
                  type="file"
                  accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {file ? (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-3 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pickFile(null)}
                    className="shrink-0 text-sm text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Chapter Markdown</span>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={14}
                className="studio-scroll w-full resize-y rounded-3xl border border-[var(--line)] bg-white/80 px-3.5 py-3 font-mono text-[13px] leading-6 outline-none transition focus:border-[var(--accent)] focus:bg-white"
                placeholder="Paste chapter Markdown…"
              />
            </label>
          )}

          {error ? (
            <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-3 text-sm whitespace-pre-wrap text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="hidden gap-2 lg:flex lg:flex-col">
            <button
              type="button"
              disabled={busy || !canRun || (inputMode === "upload" && !file)}
              onClick={() => ingestAndPlan()}
              className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Planning scenes…" : "Upload → Split → Plan scenes"}
            </button>
            <button
              type="button"
              disabled={busy || !canApprove}
              onClick={() => approveScenes()}
              className="rounded-2xl border border-[var(--line)] bg-white/80 px-5 py-3 text-sm font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {lesson?.scenes_approved ? "Scenes approved" : "Approve scenes"}
            </button>
            {lesson?.scenes_approved ? (
              <Link
                href={`/studio/${lesson.id}/presentations`}
                className="text-center text-xs leading-5 text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Open presentation pages →
              </Link>
            ) : null}
          </div>
        </section>

        {/* Results column */}
        <section className="animate-fade-up-delay min-w-0 space-y-4">
          <div className="studio-scroll flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["parts", `MD parts${parts.length ? ` (${parts.length})` : ""}`],
                ["scenes", `Scenes${lesson?.scenes?.length ? ` (${lesson.scenes.length})` : ""}`],
                ["command", "Live command"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setResultTab(tab)}
                className={`shrink-0 rounded-2xl px-3.5 py-2 text-sm transition ${
                  resultTab === tab
                    ? "bg-[var(--foreground)] text-white"
                    : "border border-[var(--line)] bg-white/60 text-[var(--ink-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[28rem] rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)] backdrop-blur-sm">
            {resultTab === "parts" ? (
              <div className="flex h-full min-h-[28rem] flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
                  <div>
                    <h2 className="font-[family-name:var(--font-display)] text-lg">Markdown parts</h2>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Structured sections for the Classroom Director
                    </p>
                  </div>
                  {lesson?.parts_dir ? (
                    <p className="hidden max-w-[14rem] truncate text-right font-mono text-[10px] text-[var(--ink-muted)] sm:block">
                      {lesson.parts_dir}
                    </p>
                  ) : null}
                </div>

                {parts.length ? (
                  <div className="grid min-h-0 flex-1 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
                    <ul className="studio-scroll max-h-[22rem] space-y-1 overflow-y-auto border-b border-[var(--line)] p-3 lg:max-h-[34rem] lg:border-b-0 lg:border-r">
                      {parts.map((part) => {
                        const active = selectedPart?.id === part.id;
                        return (
                          <li key={part.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedPartId(part.id)}
                              className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                                active
                                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                  : "hover:bg-white/70"
                              }`}
                            >
                              <span className="font-mono text-[10px] tracking-wide opacity-70">
                                {part.id}
                              </span>
                              <span className="mt-0.5 block truncate text-sm font-medium">
                                {part.title}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                                {part.char_count.toLocaleString()} chars
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="min-w-0 p-3 sm:p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{selectedPart?.title}</p>
                        <p className="font-mono text-[11px] text-[var(--ink-muted)]">
                          {selectedPart?.filename}
                        </p>
                      </div>
                      <pre className="md-preview studio-scroll max-h-[20rem] overflow-auto rounded-2xl bg-[var(--preview)] p-4 text-[12px] leading-6 text-[var(--preview-ink)] sm:max-h-[30rem] sm:text-[13px]">
                        {selectedPart?.markdown ?? ""}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No parts yet"
                    body="Upload a chapter or paste Markdown, then run the pipeline. Parts will appear here for the Director."
                  />
                )}
              </div>
            ) : null}

            {resultTab === "scenes" ? (
              <div className="flex h-full min-h-[28rem] flex-col">
                <div className="border-b border-[var(--line)] px-4 py-3 sm:px-5">
                  <h2 className="font-[family-name:var(--font-display)] text-lg">Director scenes</h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    ~80% presentation · ~20% video labels — content is generated on the next page
                  </p>
                </div>
                {lesson?.scenes?.length ? (
                  <ul className="studio-scroll max-h-[34rem] space-y-0 overflow-y-auto p-2 sm:p-3">
                    {withMediaTags(lesson.scenes).map((scene, index) => (
                      <li
                        key={scene.id}
                        className="rounded-2xl px-3 py-4 transition hover:bg-white/55 sm:px-4"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-mono text-[11px] text-[var(--accent)]">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{scene.title}</p>
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-label={`Scene media type: ${scene.media_kind}`}
                                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                                  scene.media_kind === "video"
                                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                                    : "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                }`}
                              >
                                {scene.media_kind === "video" ? "Video" : "Presentation"}
                              </button>
                            </div>
                            {scene.slide?.bullets?.length ? (
                              <ul className="mt-2 space-y-1 text-sm text-[var(--ink-muted)]">
                                {scene.slide.bullets.slice(0, 4).map((bullet) => (
                                  <li key={bullet} className="flex gap-2">
                                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                                    <span>{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {scene.visual_prompt ? (
                              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                                <span className="font-medium text-[var(--foreground)]">Visual · </span>
                                {scene.visual_prompt}
                              </p>
                            ) : null}
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                              {scene.narration}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No scenes yet"
                    body="Run Upload → Split → Plan scenes to generate classroom scenes from your MD parts."
                  />
                )}
              </div>
            ) : null}

            {resultTab === "command" ? (
              <div className="flex h-full min-h-[28rem] flex-col">
                <div className="border-b border-[var(--line)] px-4 py-3 sm:px-5">
                  <h2 className="font-[family-name:var(--font-display)] text-lg">Live command</h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Send a mid-class instruction once a lesson exists
                  </p>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full flex-1 rounded-2xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                      placeholder="e.g. Guru, explain this in Hindi."
                    />
                    <button
                      type="button"
                      disabled={busy || !lesson}
                      onClick={sendCommand}
                      className="rounded-2xl bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-45"
                    >
                      Send
                    </button>
                  </div>
                  {commandResult ? (
                    <pre className="md-preview studio-scroll max-h-[22rem] overflow-auto rounded-2xl bg-[var(--preview)] p-4 text-[12px] leading-6 text-[var(--preview-ink)]">
                      {JSON.stringify(commandResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-[var(--ink-muted)]">
                      Command responses will show up here.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {stitchedDeck?.presentation_pages?.length ? (
        <section className="animate-fade-up mt-6 rounded-3xl border border-[var(--accent)]/25 bg-[var(--accent-soft)]/40 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Approved deck
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Stitched presentation ready
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
                Saved in this browser with presentation pages, OpenAI images, and video placeholders.
                Reopen pages anytime or continue to the interactive classroom.
              </p>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                {stitchedDeck.presentation_pages.length} pages ·{" "}
                {stitchedDeck.presentation_pages.filter((p) => p.image_url).length} images ·{" "}
                {stitchedDeck.presentation_pages.filter((p) => p.media_kind === "video").length}{" "}
                video slots
              </p>
            </div>
            <Link
              href={`/studio/${stitchedDeck.id}/presentations`}
              className="shrink-0 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
            >
              Open presentation pages
            </Link>
          </div>
          <ul className="studio-scroll mt-5 flex gap-3 overflow-x-auto pb-1">
            {stitchedDeck.presentation_pages.map((page, index) => {
              const thumb = assetUrl(page.image_url);
              return (
                <li
                  key={page.scene_id}
                  className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white/80"
                >
                  <div className="aspect-[4/3] bg-black/[0.03]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-[10px] text-[var(--ink-muted)]">
                        {page.media_kind === "video" ? "Video slot" : "No image"}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-mono text-[10px] text-[var(--ink-muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="truncate text-xs font-medium">{page.headline || page.title}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="animate-fade-up mt-6 rounded-3xl border border-[var(--line)] bg-white/70 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              Teacher classroom
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
              Turn this lesson into a shareable Interactive deck with a pixel guide character.
              Run the pipeline first so scenes (and source text) are ready.
            </p>
          </div>
          <p className="rounded-2xl bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
            {MODE_LABELS.interactive}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {([15, 30, 45, 60] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationMin(d)}
              className={`rounded-2xl px-4 py-2 text-sm transition ${
                durationMin === d
                  ? "bg-[var(--foreground)] text-white"
                  : "border border-[var(--line)] bg-white/80 text-[var(--foreground)]"
              }`}
            >
              {d} min
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm text-white">
            Interactive
          </span>
          <span
            className="cursor-not-allowed rounded-2xl border border-[var(--line)] bg-black/[0.03] px-4 py-2 text-sm text-[var(--ink-muted)] opacity-70"
            title="Coming soon"
          >
            Gamified · Soon
          </span>
          <span
            className="cursor-not-allowed rounded-2xl border border-[var(--line)] bg-black/[0.03] px-4 py-2 text-sm text-[var(--ink-muted)] opacity-70"
            title="Coming soon"
          >
            Quiz · Soon
          </span>
        </div>

        {publishStage ? (
          <p className="mt-4 text-sm text-[var(--accent)]">{publishStage}</p>
        ) : null}
        {publishError ? <p className="mt-4 text-sm text-[var(--danger)]">{publishError}</p> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={publishBusy || !canPublish}
            onClick={publishInteractiveDeck}
            className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:opacity-45"
          >
            {publishBusy ? "Generating…" : "Generate interactive classroom"}
          </button>
          {!canPublish ? (
            <p className="self-center text-xs text-[var(--ink-muted)]">
              Available after Director scenes exist.
            </p>
          ) : null}
        </div>
      </section>

      {/* Mobile sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(244,248,245,0.92)] px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-7xl gap-2">
          <button
            type="button"
            disabled={busy || !canRun || (inputMode === "upload" && !file)}
            onClick={() => ingestAndPlan()}
            className="flex-1 rounded-2xl bg-[var(--accent)] px-3 py-3 text-sm font-medium text-white disabled:opacity-45"
          >
            {busy ? "Planning…" : "Plan scenes"}
          </button>
          <button
            type="button"
            disabled={busy || !canApprove}
            onClick={() => approveScenes()}
            className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-medium disabled:opacity-45"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudioPageRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-[var(--ink-muted)]">
          Loading Studio…
        </div>
      }
    >
      <StudioPage />
    </Suspense>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center px-5 py-16 sm:px-8">
      <p className="font-[family-name:var(--font-display)] text-xl">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{body}</p>
    </div>
  );
}
