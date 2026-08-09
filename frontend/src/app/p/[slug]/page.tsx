"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DeckPlayer } from "@/components/DeckPlayer";
import { withPresentationImages } from "@/lib/mock-generate";
import { getLessonBySlug, saveLesson } from "@/lib/lesson-store";
import type { LessonExperience } from "@/lib/types";

export default function PublicDeckPage() {
  const params = useParams<{ slug: string }>();
  const [lesson, setLesson] = useState<LessonExperience | null | undefined>(undefined);

  useEffect(() => {
    const stored = getLessonBySlug(params.slug);
    if (!stored) {
      setLesson(null);
      return;
    }
    const hydrated = withPresentationImages(stored);
    if (hydrated !== stored) saveLesson(hydrated);
    setLesson(hydrated);
  }, [params.slug]);

  if (lesson === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ink-muted)]">
        Loading deck…
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center px-6 py-20 text-center">
        <p className="text-lg font-medium">Deck not found</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Share links work in the same browser where the lesson was generated (mock storage).
        </p>
        <Link href="/" className="mt-6 text-[var(--accent)] hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DeckPlayer lesson={lesson} />
    </div>
  );
}
