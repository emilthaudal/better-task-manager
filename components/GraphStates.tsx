"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  const spinnerColor = accentColor === "violet" ? "text-violet-600" : "text-indigo-600";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className={`w-8 h-8 animate-spin ${spinnerColor}`} />
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
}: GraphErrorStateProps) {
  const router = useRouter();

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Card className="max-w-sm w-full text-center shadow-lg">
        <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
          <Alert variant="destructive" className="text-left">
            <AlertTitle>{heading}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <Button
            variant="link"
            size="sm"
            onClick={() => router.push(backHref)}
            className="text-xs"
          >
            Go back and try again
          </Button>
        </CardContent>
      </Card>
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
}: GraphEmptyStateProps) {
  const router = useRouter();

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground text-sm">{message}</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => router.push(backHref)}
          className="mt-1 text-xs h-auto p-0"
        >
          Go back
        </Button>
      </div>
    </div>
  );
}
