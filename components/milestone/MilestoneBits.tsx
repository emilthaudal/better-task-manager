"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Progress, StatusRef } from "@/lib/milestoneTypes";

// Shared primitives for the delivery-milestone views. Colours come from the
// `.ms` tokens in globals.css, so every primitive is dark-mode correct.

const STATUS_DOT: Record<StatusRef["category"], string> = {
  new: "bg-[var(--ms-label-3)]",
  indeterminate: "bg-[var(--ms-accent)]",
  done: "bg-[var(--ms-ready)]",
};

const STATUS_WORD: Record<StatusRef["category"], string> = {
  new: "To do",
  indeterminate: "In progress",
  done: "Done",
};

export function StatusDot({ status, className }: { status: StatusRef; className?: string }) {
  return (
    <span
      title={status.name}
      role="img"
      aria-label={`Status: ${status.name}`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status.category], className)}
    />
  );
}

export function StatusPill({ status }: { status: StatusRef }) {
  return (
    <span
      title={STATUS_WORD[status.category]}
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ms-fill-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--ms-label-2)]"
    >
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
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentDone(progress)}
      aria-label={`${progress.done} of ${progress.total} done`}
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--ms-fill)]", className)}
      title={`${progress.done} done · ${progress.inProgress} in progress · ${progress.todo} to do`}
    >
      <div className="bg-[var(--ms-ready)] transition-[width] duration-500" style={{ width: `${pct(progress.done)}%` }} />
      <div className="bg-[var(--ms-accent)] transition-[width] duration-500" style={{ width: `${pct(progress.inProgress)}%` }} />
    </div>
  );
}

/** Circular progress, the way Apple shows completion at a glance. Fills in on mount. */
export function ProgressRing({ progress, size = 44, stroke = 4.5 }: { progress: Progress; size?: number; stroke?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = shown && progress.total ? progress.done / progress.total : 0;
  const active = shown && progress.total ? progress.inProgress / progress.total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ms-fill)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ms-accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * (done + active)} ${c}`} opacity={0.35}
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ms-ready)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * done} ${c}`}
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms" }}
      />
    </svg>
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
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-[3px] font-mono text-[11px] font-medium leading-none transition-colors",
    critical
      ? "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]"
      : "bg-[var(--ms-fill-2)] text-[var(--ms-label-2)]",
    onClick && "cursor-pointer hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)]",
    className,
  );
  return onClick ? (
    <button type="button" className={classes} onClick={() => onClick(issueKey)} aria-label={`Show ${issueKey}`}>
      {issueKey}
    </button>
  ) : (
    <span className={classes}>{issueKey}</span>
  );
}

type Tone = "critical" | "warn" | "ready" | "cross";

const TONE_TEXT: Record<Tone, string> = {
  critical: "text-[var(--ms-critical-text)]",
  warn: "text-[var(--ms-warn-text)]",
  ready: "text-[var(--ms-ready-text)]",
  cross: "text-[var(--ms-cross-text)]",
};

const TONE_FILL: Record<Tone, string> = {
  critical: "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]",
  warn: "bg-[var(--ms-warn-fill)] text-[var(--ms-warn-text)]",
  ready: "bg-[var(--ms-ready-fill)] text-[var(--ms-ready-text)]",
  cross: "bg-[var(--ms-cross-fill)] text-[var(--ms-cross-text)]",
};

export function Badge({ tone, children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-[2px] text-[10px] font-semibold leading-none tabular-nums",
        tone ? TONE_FILL[tone] : "bg-[var(--ms-fill-2)] text-[var(--ms-label-2)]",
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="flex min-w-[88px] flex-col gap-0.5" title={hint}>
      <span className="text-[11px] font-medium text-[var(--ms-label-3)]">{label}</span>
      <span className={cn("text-[22px] font-semibold leading-tight tracking-tight tabular-nums", tone ? TONE_TEXT[tone] : "text-[var(--ms-label)]")}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-[var(--ms-label-3)]">{unit}</span>}
      </span>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2 px-1">
      <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ms-label)]">{children}</h2>
      {hint && <span className="text-[12px] text-[var(--ms-label-3)]">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  // ARIA radio group: one tab stop, arrow keys move the choice.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const at = options.findIndex((o) => o.value === value);
    const next = options[(at + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons[(at + step + options.length) % options.length]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex shrink-0 rounded-[9px] bg-[var(--ms-fill)] p-[2px]">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[7px] px-3 py-[3px] text-[12.5px] font-medium transition-all duration-200",
              on
                ? "bg-[var(--ms-surface-raised)] text-[var(--ms-label)] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "text-[var(--ms-label-2)] hover:text-[var(--ms-label)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ name, size = 16 }: { name: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        name ? "bg-[var(--ms-fill)] text-[var(--ms-label-2)]" : "border border-dashed border-[var(--ms-sep-strong)]",
      )}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name ? initials(name) : null}
    </span>
  );
}

/** Grouped inset list surface (iOS/macOS settings style). */
export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]", className)}>
      {children}
    </div>
  );
}
