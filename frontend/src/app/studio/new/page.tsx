"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { CreateWizard } from "@/components/CreateWizard";

export default function NewStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
        >
          ← Dashboard
        </Link>
        <UserButton />
      </div>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        Create interactive lesson
      </h1>
      <p className="mt-1 mb-8 text-sm text-[var(--ink-muted)]">
        Upload → configure → generate a shareable interactive deck.
      </p>
      <CreateWizard />
    </div>
  );
}
