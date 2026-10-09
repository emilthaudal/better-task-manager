"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "btm:deliveryProject";
const DEFAULT_PROJECT = "LAD";

function readSavedProject(): string {
  if (typeof window === "undefined") return DEFAULT_PROJECT;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_PROJECT;
  } catch {
    return DEFAULT_PROJECT;
  }
}

/** Entry point to the delivery program: milestones, critical path and blockers. */
export default function ProgramEntry() {
  const router = useRouter();
  const [project, setProject] = useState(readSavedProject);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const key = project.trim().toUpperCase();
    if (!key) return;
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Not worth surfacing.
    }
    router.push(`/program/${encodeURIComponent(key)}`);
  }

  return (
    <form
      onSubmit={open}
      className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow focus-within:shadow-md"
    >
      <div
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M3 15h3.5l3-5 3 3L17 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17" cy="5" r="1.6" fill="currentColor" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">Delivery milestones</div>
        <div className="truncate text-xs text-muted-foreground">Critical path, blocker epics and team load per release</div>
      </div>
      <input
        value={project}
        onChange={(e) => setProject(e.target.value)}
        aria-label="Delivery project key"
        // The saved key is only known client-side.
        suppressHydrationWarning
        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center font-mono text-sm uppercase text-foreground outline-none transition-shadow focus:ring-2 focus:ring-primary/40"
      />
      <button
        type="submit"
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        Open
      </button>
    </form>
  );
}
