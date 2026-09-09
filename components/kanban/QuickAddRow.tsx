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
        className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 dark:text-slate-500 rounded-md px-2 py-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add issue
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] focus-within:border-indigo-300 dark:focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-950">
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
        className="w-full text-[12.5px] font-medium bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || submitting}
          className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition-colors"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={submitting}
          className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
