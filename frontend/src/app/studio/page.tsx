"use client";

import { useState } from "react";
import Link from "next/link";
import { api, type Lesson } from "@/lib/api";

const SAMPLE_LESSON = `## The Indian Independence Movement

The struggle for independence involved many leaders, movements, and milestones.

### Non-Cooperation
Gandhi called for boycotts of British institutions and goods.

### Civil Disobedience
The Salt March became a powerful symbol of resistance.

### Quit India
In 1942, the demand for immediate independence intensified.`;

export default function StudioPage() {
  const [title, setTitle] = useState("The Indian Independence Movement");
  const [sourceText, setSourceText] = useState(SAMPLE_LESSON);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [commandResult, setCommandResult] = useState<Record<string, unknown> | null>(null);
  const [command, setCommand] = useState("Guru, explain this in Hindi.");
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runFlow() {
    setBusy(true);
    setError(null);
    setReport(null);
    setCommandResult(null);

    try {
      setStatus("Creating lesson…");
      const created = await api.createLesson({
        title,
        source_text: sourceText,
        subject: "History",
        language: "en",
      });

      setStatus("Generating scenes…");
      const generated = await api.generateLesson(created.id);
      setLesson(generated);

      setStatus("Simulating classroom…");
      const simulation = await api.simulateClassroom(generated.id);
      setReport(simulation);

      setStatus("Ready — try a classroom command");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← GuruDroneAI
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Studio (scaffold)</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            End-to-end Create → Generate → Simulate → Command against local APIs.
          </p>
        </div>
        <p className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
          {status}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <label className="block text-sm font-medium">
            Lesson title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-sm font-medium">
            Source material
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={14}
              className="mt-1 w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            disabled={busy || !title.trim() || !sourceText.trim()}
            onClick={runFlow}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Running…" : "Create → Generate → Simulate"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Generated scenes
            </h2>
            {lesson?.scenes?.length ? (
              <ul className="mt-3 space-y-3">
                {lesson.scenes.map((scene) => (
                  <li key={scene.id} className="border-t border-black/5 pt-3 first:border-0 first:pt-0">
                    <p className="font-medium">{scene.title}</p>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{scene.narration}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--ink-muted)]">No scenes yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Readiness report
            </h2>
            {report ? (
              <pre className="mt-3 overflow-x-auto text-xs leading-5 text-[var(--foreground)]">
                {JSON.stringify(report, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-[var(--ink-muted)]">Run simulation to see the report.</p>
            )}
          </div>

          <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Live command
            </h2>
            <div className="mt-3 flex gap-2">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                disabled={busy || !lesson}
                onClick={sendCommand}
                className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
            {commandResult ? (
              <pre className="mt-3 overflow-x-auto text-xs leading-5">
                {JSON.stringify(commandResult, null, 2)}
              </pre>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
