"use client";

import type { JiraStatus } from "@/lib/jira";
import { STATUS_STYLES } from "./tokens";

export function StatusBadge({ status }: { status: JiraStatus }) {
  const s = STATUS_STYLES[status.statusCategory.key] ?? STATUS_STYLES.new;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border dark:bg-muted dark:border-border dark:text-foreground ${s.text} ${s.bg} ${s.border}`}>
      <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
      {status.name}
    </span>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
      {count !== undefined && (
        <span className="text-xs font-semibold text-muted-foreground bg-accent px-1.5 py-0.5 rounded-md tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pt-5 border-t border-border ${className}`}>
      {children}
    </div>
  );
}
