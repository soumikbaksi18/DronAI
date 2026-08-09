"use client";

import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { CreateWizard } from "@/components/CreateWizard";

export default function NewStudioPage() {
  return (
    <AuthGate>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <Link href="/dashboard" className="text-sm text-[var(--accent)] hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create lesson</h1>
        <p className="mt-1 mb-8 text-sm text-[var(--ink-muted)]">
          Upload → configure → generate a shareable interactive deck.
        </p>
        <CreateWizard />
      </div>
    </AuthGate>
  );
}
