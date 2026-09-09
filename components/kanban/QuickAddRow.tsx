"use client";

interface QuickAddRowProps {
  onClick: () => void;
}

/** Trigger for the create-issue dialog — a quiet button matching Jira's own "+ Create" board affordance. */
export default function QuickAddRow({ onClick }: QuickAddRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground border border-dashed border-border rounded-lg px-2.5 py-1.5 hover:text-foreground hover:border-foreground/30 hover:bg-card transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Add issue
    </button>
  );
}
