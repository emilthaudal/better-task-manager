export const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  new: {
    dot: "#94a3b8",
    text: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-200",
  },
  indeterminate: {
    dot: "#6366f1",
    text: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
  done: {
    dot: "#22c55e",
    text: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
  },
};

export const STATUS_ACCENT: Record<string, string> = {
  new: "bg-slate-300",
  indeterminate: "bg-indigo-400",
  done: "bg-green-400",
};

export const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  Highest: { color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    icon: "↑↑" },
  High:    { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: "↑"  },
  Medium:  { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", icon: "→"  },
  Low:     { color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   icon: "↓"  },
  Lowest:  { color: "text-slate-500",  bg: "bg-slate-100", border: "border-slate-200",  icon: "↓↓" },
};
