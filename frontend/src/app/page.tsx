import Link from "next/link";

const LOOP = ["Create", "Simulate", "Critique", "Refine", "Teach", "Adapt"] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6 sm:py-6">
        <p className="font-[family-name:var(--font-display)] text-base tracking-wide text-[var(--accent)] sm:text-lg">
          GuruDroneAI
        </p>
        <Link
          href="/studio"
          className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
        >
          Open Studio
        </Link>
      </header>

      <main className="animate-fade-up mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8">
        <p className="mb-3 text-sm text-[var(--ink-muted)] sm:mb-4">AI Classroom Operating System</p>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl md:text-6xl">
          GuruDroneAI
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-muted)] sm:text-lg sm:leading-8">
          Turn lesson notes into a live, multilingual classroom experience — then simulate it with AI
          student personas before you teach.
        </p>

        <div className="mt-8 flex flex-wrap gap-2 sm:mt-10">
          {LOOP.map((step, index) => (
            <span
              key={step}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--accent)]"
            >
              <span className="font-mono text-xs opacity-70">{index + 1}</span>
              {step}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:mt-12 sm:flex-row sm:flex-wrap">
          <Link
            href="/studio"
            className="rounded-2xl bg-[var(--foreground)] px-5 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
          >
            Open Lesson Studio
          </Link>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-[var(--line)] bg-white/70 px-5 py-3 text-center text-sm font-medium text-[var(--foreground)] transition hover:bg-white"
          >
            Backend API docs
          </a>
        </div>
      </main>
    </div>
  );
}
