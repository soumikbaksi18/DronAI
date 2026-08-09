"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { clearTeacherSession, getTeacherSession } from "@/lib/auth";
import { listLessons, shareUrlForSlug } from "@/lib/lesson-store";
import type { LessonExperience, TeacherSession } from "@/lib/types";
import { MODE_LABELS } from "@/lib/types";

function DashboardInner() {
  const router = useRouter();
  const [teacher, setTeacher] = useState<TeacherSession | null>(null);
  const [lessons, setLessons] = useState<LessonExperience[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setTeacher(getTeacherSession());
    setLessons(listLessons());
  }, []);

  function logout() {
    clearTeacherSession();
    router.replace("/login");
  }

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← GuruDroneAI
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {teacher ? `Signed in as ${teacher.name}` : "Teacher"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/studio"
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm"
          >
            API simulate
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm"
          >
            Log out
          </button>
          <Link
            href="/studio/new"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Create new lesson
          </Link>
        </div>
      </header>

      <main className="mt-10">
        {lessons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-black/15 bg-white/50 px-8 py-16 text-center">
            <p className="text-lg font-medium">No lessons yet</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Upload materials and generate an interactive classroom deck.
            </p>
            <Link
              href="/studio/new"
              className="mt-6 inline-flex rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Create your first lesson
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {lessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between"
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
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm"
                  >
                    Preview
                  </Link>
                  <Link
                    href={`/p/${lesson.slug}`}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm"
                  >
                    Open deck
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyShare(lesson)}
                    className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--accent)]"
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

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardInner />
    </AuthGate>
  );
}
