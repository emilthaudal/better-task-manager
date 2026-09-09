"use client";

import { useState } from "react";

interface QuickAddRowProps {
  onSubmit: (summary: string) => Promise<void>;
}

/** Linear-style inline create: a dashed "Add issue" button that turns into a title-only input on click. */
export default function QuickAddRow({ onSubmit }: QuickAddRowProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setOpen(false);
    setValue("");
  }

  async function submit() {
    const summary = value.trim();
    if (!summary || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(summary);
      close();
    } catch {
      // Error is surfaced via toast by the caller — keep the draft so the user can retry.
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add issue
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-800 p-2 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]">
      <input
        autoFocus
        value={value}
        disabled={submitting}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") close();
        }}
        placeholder="Issue title…"
        className="w-full text-[13px] bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
      <div className="flex items-center gap-1.5 mt-2">
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || submitting}
          className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white transition-colors"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={submitting}
          className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
