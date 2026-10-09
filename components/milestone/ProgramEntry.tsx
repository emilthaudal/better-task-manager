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
      className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3"
    >
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">Delivery milestones</div>
        <div className="text-xs text-muted-foreground">Critical path, blocker epics and team load per release</div>
      </div>
      <input
        value={project}
        onChange={(e) => setProject(e.target.value)}
        aria-label="Delivery project key"
        // The saved key is only known client-side.
        suppressHydrationWarning
        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center font-mono text-sm uppercase text-foreground"
      />
      <button
        type="submit"
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open
      </button>
    </form>
  );
}
