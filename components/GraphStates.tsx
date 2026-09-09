"use client";

import { useRouter } from "next/navigation";

// ── GraphLoadingState ─────────────────────────────────────────────────────────

interface GraphLoadingStateProps {
  /** Optional progress for streaming loads (e.g. project page). */
  progress?: { done: number; total: number } | null;
  /** Default label shown when no progress is available. */
  label?: string;
  /** Accent color class for the spinner ring. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered spinner shown while graph data is loading.
 * Accepts an optional `progress` object for streaming progress display.
 */
export function GraphLoadingState({
  progress,
  label = "Loading…",
  accentColor = "indigo",
}: GraphLoadingStateProps) {
  const ringBase = accentColor === "violet" ? "border-secondary/20" : "border-primary/20";
  const ringAccent = accentColor === "violet"
    ? "border-secondary border-t-transparent"
    : "border-primary border-t-transparent";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className={`absolute inset-0 rounded-full border-2 ${ringBase}`} />
          <div className={`absolute inset-0 rounded-full border-2 ${ringAccent} animate-spin`} />
        </div>
        {progress ? (
          <p className="text-sm text-muted-foreground font-medium">
            Loading {progress.done} / {progress.total} epics…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
        )}
      </div>
    </div>
  );
}

// ── GraphErrorState ───────────────────────────────────────────────────────────

interface GraphErrorStateProps {
  /** Error message to display. */
  message: string;
  /** Heading above the error message. */
  heading?: string;
  /** Route to navigate to when "Go back" is clicked. Defaults to "/". */
  backHref?: string;
  /** Accent color for the back-link text. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered error card with a "Go back and try again" link.
 */
export function GraphErrorState({
  message,
  heading = "Failed to load",
  backHref = "/",
  accentColor = "indigo",
}: GraphErrorStateProps) {
  const router = useRouter();
  const linkColor = accentColor === "violet" ? "text-secondary" : "text-primary";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-card border border-destructive/30 rounded-2xl px-8 py-6 max-w-sm text-center shadow-lg">
        <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 6v4M9 12.5v.5" stroke="var(--destructive)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="9" r="7.5" stroke="var(--destructive)" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="font-semibold text-sm text-foreground mb-1">{heading}</p>
        <p className="text-xs text-muted-foreground mb-4">{message}</p>
        <button
          onClick={() => router.push(backHref)}
          className={`text-xs font-medium ${linkColor} hover:underline cursor-pointer`}
        >
          Go back and try again
        </button>
      </div>
    </div>
  );
}

// ── GraphEmptyState ───────────────────────────────────────────────────────────

interface GraphEmptyStateProps {
  /** Message shown to the user. */
  message: string;
  /** Route to navigate to when "Go back" is clicked. Defaults to "/". */
  backHref?: string;
  /** Accent color for the back-link text. Defaults to indigo. */
  accentColor?: "indigo" | "violet";
}

/**
 * Centered empty state with a "Go back" link.
 */
export function GraphEmptyState({
  message,
  backHref = "/",
  accentColor = "indigo",
}: GraphEmptyStateProps) {
  const router = useRouter();
  const linkColor = accentColor === "violet" ? "text-secondary" : "text-primary";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground text-sm">{message}</p>
        <button
          onClick={() => router.push(backHref)}
          className={`mt-2 text-xs ${linkColor} hover:underline cursor-pointer`}
        >
          Go back
        </button>
      </div>
    </div>
  );
}
