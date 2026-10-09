"use client";

import Link from "next/link";
import { useSecondsTick } from "@/hooks/useSecondsTick";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

// Window chrome for the delivery pages: a translucent toolbar, loading
// skeletons and the error state. Kept apart from the data components so the
// program and milestone pages share one look.

function Updated({ lastUpdated, refreshing, onRefresh }: { lastUpdated: Date | null; refreshing: boolean; onRefresh?: () => void }) {
  const seconds = useSecondsTick(lastUpdated?.getTime() ?? null);
  if (!lastUpdated) return null;
  const label = seconds < 10 ? "Updated just now" : seconds < 60 ? `Updated ${seconds}s ago` : `Updated ${Math.floor(seconds / 60)} min ago`;
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={!onRefresh || refreshing}
      title="Refreshes automatically every minute. Click to refresh now."
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-[var(--ms-label-3)] transition-colors hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label-2)]"
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full bg-[var(--ms-ready)]", refreshing && "animate-pulse bg-[var(--ms-accent)]")}
      />
      <span aria-live="polite">{refreshing ? "Refreshing…" : label}</span>
    </button>
  );
}

export function Toolbar({
  backHref,
  backLabel,
  title,
  center,
  lastUpdated,
  refreshing = false,
  onRefresh,
}: {
  backHref: string;
  backLabel: string;
  title?: React.ReactNode;
  center?: React.ReactNode;
  lastUpdated: Date | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <header className="ms-chrome sticky top-0 z-40 grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--ms-sep)] pl-3 pr-16">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={backHref}
          className="group flex shrink-0 items-center gap-0.5 rounded-lg py-1 pl-1 pr-2 text-[13px] font-medium text-[var(--ms-accent-text)] transition-colors hover:bg-[var(--ms-fill-2)]"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M10 12.5 5.5 8 10 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>
        {title && <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--ms-label)]">{title}</div>}
      </div>
      <div className="flex justify-center">{center}</div>
      <div className="flex items-center justify-end gap-1">
        <Updated lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={onRefresh} />
        <ThemeToggle />
      </div>
    </header>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn("ms-skeleton", className)} style={style} />;
}

/** Placeholder with the milestone page's real proportions, so nothing jumps on load. */
export function MilestoneSkeleton() {
  return (
    <div role="status" aria-label="Loading milestone" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-end gap-10 border-b border-[var(--ms-sep)] px-8 pb-5 pt-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-2 w-56" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-b border-[var(--ms-sep)] px-8 py-2.5">
        <Skeleton className="h-7 w-48 rounded-[9px]" />
        <Skeleton className="h-7 w-64 rounded-[9px]" />
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 5 }, (_, lane) => (
          <div key={lane} className={cn("flex border-t border-[var(--ms-sep)]", lane % 2 === 1 && "bg-[var(--ms-lane)]")}>
            <div className="flex w-[188px] shrink-0 flex-col justify-center gap-2 border-r border-[var(--ms-sep)] px-4 py-6">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <div className="flex gap-14 px-7 py-3.5">
              {Array.from({ length: 4 - (lane % 3) }, (_, i) => (
                <Skeleton key={i} className="h-[84px] w-[216px] rounded-xl" style={{ animationDelay: `${(lane + i) * 80}ms` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry, backHref }: { message: string; onRetry: () => void; backHref: string }) {
  const auth = /auth|sign in/i.test(message);
  return (
    <div role="alert" className="flex flex-1 items-center justify-center p-8">
      <div className="ms-fade-up flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ms-warn-fill)] text-[var(--ms-warn-text)]" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-[17px] font-semibold text-[var(--ms-label)]">{auth ? "Sign in to Jira again" : "Couldn’t load this milestone"}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ms-label-2)]">{message}</p>
        <div className="mt-5 flex gap-2">
          {auth ? (
            <a href="/api/auth/login" className="rounded-full bg-[var(--ms-accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
              Sign in
            </a>
          ) : (
            <button type="button" onClick={onRetry} className="rounded-full bg-[var(--ms-accent)] px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
              Try again
            </button>
          )}
          <Link href={backHref} className="rounded-full bg-[var(--ms-fill)] px-4 py-1.5 text-[13px] font-medium text-[var(--ms-label)] hover:bg-[var(--ms-sep-strong)]">
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
