import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 w-full max-w-md text-left">
        <Link
          href="/"
          className="text-sm text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
        >
          ← GuruDroneAI
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Create teacher account
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Sign up to build and share interactive classroom decks.
        </p>
      </div>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/login"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
