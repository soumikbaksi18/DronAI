import Link from "next/link";

const LOOP = ["Create", "Simulate", "Critique", "Refine", "Teach", "Adapt"] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          GuruDroneAI
        </p>
        <Link
          href="/studio"
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Open Studio
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-20 pt-8">
        <p className="mb-4 text-sm text-[var(--ink-muted)]">
          AI Classroom Operating System
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
          GuruDroneAI
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--ink-muted)]">
          Turn lesson notes into a live, multilingual classroom experience —
          then simulate it with AI student personas before you teach.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          {LOOP.map((step, index) => (
            <span
              key={step}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--accent)]"
            >
              <span className="font-mono text-xs opacity-70">{index + 1}</span>
              {step}
            </span>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/studio"
            className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Try the scaffold flow
          </Link>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-white"
          >
            Backend API docs
          </a>
        </div>
      </main>
    </div>
  );
}
