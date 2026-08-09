"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { DeckPlayer } from "@/components/DeckPlayer";
import { withPresentationImages } from "@/lib/mock-generate";
import { getLessonById, saveLesson, shareUrlForSlug } from "@/lib/lesson-store";
import type { LessonExperience } from "@/lib/types";

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonExperience | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = getLessonById(params.id);
    if (!stored) {
      setLesson(null);
      return;
    }
    const hydrated = withPresentationImages(stored);
    if (hydrated !== stored) saveLesson(hydrated);
    setLesson(hydrated);
  }, [params.id]);

  async function copyShare() {
    if (!lesson) return;
    const url = shareUrlForSlug(lesson.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy share link:", url);
    }
  }

  if (lesson === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ink-muted)]">
        Loading…
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-medium">Lesson not found</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          It may have been cleared from this browser&apos;s storage.
        </p>
        <Link href="/studio/new" className="mt-6 inline-block text-[var(--accent)] hover:underline">
          Create a new lesson
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
        >
          <span aria-hidden>←</span>
          <span>Dashboard</span>
          <span className="hidden text-[var(--line)] sm:inline">·</span>
          <span className="hidden text-[var(--ink-muted)] sm:inline">Teacher preview</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyShare}
            className="rounded-full bg-white/80 px-3.5 py-2 text-sm text-[var(--accent)] ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <Link
            href={`/p/${lesson.slug}`}
            className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
          >
            Open public deck
          </Link>
          <UserButton />
        </div>
      </div>
      <DeckPlayer lesson={lesson} />
    </div>
  );
}
