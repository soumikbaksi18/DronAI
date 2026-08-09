"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fakeExtractFromAssets, runMockGenerate } from "@/lib/mock-generate";
import { saveLesson } from "@/lib/lesson-store";
import type { LessonAsset, LessonMode } from "@/lib/types";
import { MODE_LABELS } from "@/lib/types";
import { UploadDropzone } from "./UploadDropzone";

const DURATIONS = [15, 30, 45, 60] as const;
const MODES: LessonMode[] = ["interactive", "gamified", "quiz"];

type Step = "upload" | "configure" | "generate";

export function CreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [title, setTitle] = useState("The Indian Independence Movement");
  const [assets, setAssets] = useState<LessonAsset[]>([]);
  const [durationMin, setDurationMin] = useState<15 | 30 | 45 | 60>(30);
  const [mode, setMode] = useState<LessonMode>("interactive");
  const [stage, setStage] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setWarning(null);
    setStep("generate");
    try {
      const sourceText = fakeExtractFromAssets(assets, title);
      let warned: string | null = null;
      const lesson = await runMockGenerate(
        { title, durationMin, mode: "interactive", assets, sourceText },
        (label, index) => {
          setStage(label);
          setStageIndex(index);
        },
        (message) => {
          warned = message;
          setWarning(message);
        },
      );
      saveLesson(lesson);
      // Give the teacher a beat to read why the guide is a placeholder.
      if (warned) await new Promise((resolve) => setTimeout(resolve, 2200));
      router.push(`/studio/${lesson.id}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("configure");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <ol className="flex flex-wrap gap-2 text-xs">
        {(["upload", "configure", "generate"] as Step[]).map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              step === s
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--accent-soft)] text-[var(--accent)]"
            }`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Upload materials</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Word, PDF, Markdown, images, or short videos. Extraction is mocked.
            </p>
          </div>
          <UploadDropzone assets={assets} onChange={setAssets} />
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setAssets([]);
                setStep("configure");
              }}
              className="text-sm text-[var(--ink-muted)] underline-offset-2 hover:underline"
            >
              Skip — use sample text
            </button>
            <button
              type="button"
              onClick={() => setStep("configure")}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === "configure" ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Configure lecture</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Duration shapes scene count. Only Interactive is available in this mock.
            </p>
          </div>

          <label className="block text-sm font-medium">
            Lesson title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>

          <div>
            <p className="text-sm font-medium">Duration</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationMin(d)}
                  className={`rounded-full px-4 py-2 text-sm ${
                    durationMin === d
                      ? "bg-[var(--foreground)] text-white"
                      : "border border-[var(--line)] bg-white/70 text-[var(--foreground)]"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Mode</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODES.map((m) => {
                const enabled = m === "interactive";
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!enabled}
                    onClick={() => enabled && setMode(m)}
                    className={`rounded-full px-4 py-2 text-sm ${
                      mode === m && enabled
                        ? "bg-[var(--accent)] text-white"
                        : enabled
                          ? "border border-[var(--line)] bg-white/70"
                          : "cursor-not-allowed border border-[var(--line)] bg-black/[0.03] text-[var(--ink-muted)] opacity-70"
                    }`}
                    title={enabled ? MODE_LABELS[m] : "Coming soon"}
                  >
                    {MODE_LABELS[m]}
                    {!enabled ? " · Soon" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded-full border border-[var(--line)] bg-white/70 px-5 py-2.5 text-sm"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={generate}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Generate classroom experience
            </button>
          </div>
        </section>
      ) : null}

      {step === "generate" ? (
        <section className="space-y-6 py-10 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Generating…</h2>
          <p className="text-sm text-[var(--ink-muted)]">{stage ?? "Starting…"}</p>
          {warning ? (
            <p className="mx-auto max-w-sm rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {warning}
            </p>
          ) : null}
          <div className="mx-auto flex max-w-xs gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= stageIndex ? "bg-[var(--accent)]" : "bg-black/10"
                }`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
