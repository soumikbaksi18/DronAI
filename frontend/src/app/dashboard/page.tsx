"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { listLessons, shareUrlForSlug } from "@/lib/lesson-store";
import type { LessonExperience } from "@/lib/types";
import { MODE_LABELS } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useUser();
  const [lessons, setLessons] = useState<LessonExperience[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setLessons(listLessons());
  }, []);

  async function copyShare(lesson: LessonExperience) {
    const url = shareUrlForSlug(lesson.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(lesson.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy share link:", url);
    }
  }

  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "Teacher";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
          >
            ← GuruDroneAI
          </Link>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Signed in as {displayName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio"
            className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-2 text-sm transition hover:bg-white"
          >
            Lesson Studio
          </Link>
          <Link
            href="/studio/new"
            className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
          >
            Create interactive lesson
          </Link>
          <UserButton />
        </div>
      </header>

      <main className="mt-10">
        {lessons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/50 px-8 py-16 text-center">
            <p className="font-[family-name:var(--font-display)] text-xl">No interactive decks yet</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Create from the wizard, or publish from Lesson Studio after running the pipeline.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/studio/new"
                className="inline-flex rounded-2xl bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-white"
              >
                Create interactive lesson
              </Link>
              <Link
                href="/studio"
                className="inline-flex rounded-2xl border border-[var(--line)] bg-white px-5 py-2.5 text-sm font-medium"
              >
                Open Lesson Studio
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {lessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight">{lesson.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    {MODE_LABELS[lesson.mode]} · {lesson.durationMin} min ·{" "}
                    {lesson.scenes.length} scenes · {lesson.status}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-[var(--ink-muted)]">
                    /p/{lesson.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/studio/${lesson.id}/preview`}
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
                  >
                    Preview
                  </Link>
                  <Link
                    href={`/p/${lesson.slug}`}
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm"
                  >
                    Open deck
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyShare(lesson)}
                    className="rounded-2xl bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--accent)]"
                  >
                    {copiedId === lesson.id ? "Copied" : "Copy share link"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
