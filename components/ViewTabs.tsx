"use client";

export type ViewTab = "graph" | "kanban";

interface ViewTabsProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
}

/**
 * Tab toggle bar for switching between the dependency graph and kanban board
 * views on the project graph page.
 */
export default function ViewTabs({ activeTab, onTabChange }: ViewTabsProps) {
  return (
    <div className="flex items-center gap-1 px-5 py-2 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-700/80 shrink-0">
      <TabButton
        label="Graph"
        icon={<GraphIcon />}
        active={activeTab === "graph"}
        onClick={() => onTabChange("graph")}
      />
      <TabButton
        label="Kanban"
        icon={<KanbanIcon />}
        active={activeTab === "kanban"}
        onClick={() => onTabChange("kanban")}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150",
        active
          ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function GraphIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2.5" y1="2.5" x2="6.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
      <line x1="10.5" y1="2.5" x2="6.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="3.2" height="10" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="4.9" y="1.5" width="3.2" height="6.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.8" y="1.5" width="3.2" height="8.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
