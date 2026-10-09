import { cn } from "@/lib/utils";
import type { Progress, StatusRef } from "@/lib/milestoneTypes";

const STATUS_DOT: Record<StatusRef["category"], string> = {
  new: "bg-[var(--status-todo)]",
  indeterminate: "bg-[var(--status-progress)]",
  done: "bg-[var(--status-done)]",
};

export function StatusDot({ status, className }: { status: StatusRef; className?: string }) {
  return (
    <span
      title={status.name}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status.category], className)}
    />
  );
}

export function StatusPill({ status }: { status: StatusRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <StatusDot status={status} />
      {status.name}
    </span>
  );
}

/** Stacked done / in-progress / to-do bar. */
export function ProgressBar({ progress, className }: { progress: Progress; className?: string }) {
  const pct = (n: number) => (progress.total === 0 ? 0 : (n / progress.total) * 100);
  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      title={`${progress.done} done · ${progress.inProgress} in progress · ${progress.todo} to do`}
    >
      <div className="bg-[var(--status-done)]" style={{ width: `${pct(progress.done)}%` }} />
      <div className="bg-[var(--status-progress)]" style={{ width: `${pct(progress.inProgress)}%` }} />
    </div>
  );
}

export function percentDone(progress: Progress): number {
  return progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
}

export function KeyChip({
  issueKey,
  onClick,
  critical,
  className,
}: {
  issueKey: string;
  onClick?: (key: string) => void;
  critical?: boolean;
  className?: string;
}) {
  const classes = cn(
    "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold transition-colors",
    critical
      ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : "border-border bg-muted/60 text-muted-foreground",
    onClick && "cursor-pointer hover:border-primary/40 hover:text-foreground",
    className,
  );
  return onClick ? (
    <button type="button" className={classes} onClick={() => onClick(issueKey)}>
      {issueKey}
    </button>
  ) : (
    <span className={classes}>{issueKey}</span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "critical" | "warn" }) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight text-foreground",
          tone === "critical" && "text-rose-600 dark:text-rose-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
