"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTeacherSession, mockLogin } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("teacher@gurudrone.ai");
  const [name, setName] = useState("Priya Sharma");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getTeacherSession()) router.replace("/dashboard");
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    mockLogin(email, name);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
        ← GuruDroneAI
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Teacher login</h1>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Mock session only — stored in this browser.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Continue as teacher
        </button>
      </form>
    </div>
  );
}
