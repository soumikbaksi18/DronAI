"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getTeacherSession } from "@/lib/auth";
import type { TeacherSession } from "@/lib/types";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<TeacherSession | null | undefined>(undefined);

  useEffect(() => {
    const s = getTeacherSession();
    setSession(s);
    if (!s) router.replace("/login");
  }, [router]);

  if (session === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-20 text-sm text-[var(--ink-muted)]">
        Checking session…
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
