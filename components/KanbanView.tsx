"use client";

import { useMemo, useState } from "react";
import type { JiraIssue, JiraIssueType } from "@/lib/jira";
import { STATUS_COLORS, EPIC_COLORS, UNASSIGNED_EPIC_COLOR, UNASSIGNED_EPIC_KEY } from "@/lib/graphConstants";

// ── Constants ─────────────────────────────────────────────────────────────────

const ISSUE_TYPE_LABEL: Record<string, { short: string; color: string; bg: string }> = {
  Story: { short: "Story", color: "#0891b2", bg: "#e0f9ff" },
  Bug: { short: "Bug", color: "#dc2626", bg: "#fee2e2" },
  Task: { short: "Task", color: "#0369a1", bg: "#e0f2fe" },
  Subtask: { short: "Sub", color: "#0369a1", bg: "#e0f2fe" },
  Epic: { short: "Epic", color: "#d97706", bg: "#fef3c7" },
};

/** Category order — matches Jira's default board layout (To Do → In Progress → Done). */
const CATEGORY_ORDER: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };

const COL_WIDTH = 260;
const COL_GAP = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function isBoardable(issuetype: JiraIssueType): boolean {
  return !issuetype.subtask && issuetype.name !== "Epic";
}

/**
 * Walks up the parent chain (using each issue's own embedded parent
 * reference — no extra fetch needed) to find the epic an issue belongs to.
 * `issueMap` only needs to contain non-epic issues since an epic reference
 * is always resolved directly off the embedded `parent.fields`.
 */
function findEpicRef(
  issue: JiraIssue,
  issueMap: Map<string, JiraIssue>,
): { key: string; summary: string } | null {
  let current: JiraIssue | undefined = issue;
  while (current) {
    const parent = current.fields.parent;
    if (!parent) return null;
    if (parent.fields.issuetype.name === "Epic") {
      return { key: parent.key, summary: parent.fields.summary };
    }
    current = issueMap.get(parent.key);
  }
  return null;
}

function formatCreated(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Column {
  statusId: string;
  statusName: string;
  statusCategory: string;
  count: number;
}

interface EpicGroup {
  key: string;
  summary: string;
  color: { tint: string; header: string; text: string; border: string };
  total: number;
  byStatus: Map<string, JiraIssue[]>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface KanbanViewProps {
  issues: JiraIssue[];
  onIssueSelect?: (key: string) => void;
  selectedKey?: string | null;
}

export default function KanbanView({ issues, onIssueSelect, selectedKey }: KanbanViewProps) {
  const boardIssues = useMemo(() => issues.filter((i) => isBoardable(i.fields.issuetype)), [issues]);
  const issueMap = useMemo(() => new Map(boardIssues.map((i) => [i.key, i])), [boardIssues]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Global column set — every status that has at least one issue anywhere on
  // the board gets a column, shared by every epic group below (so a status
  // with zero issues *for a given epic* still shows as an empty cell rather
  // than the columns shifting between epics).
  const columns: Column[] = useMemo(() => {
    const byStatus = new Map<string, Column>();
    for (const issue of boardIssues) {
      const status = issue.fields.status;
      const existing = byStatus.get(status.id);
      if (existing) {
        existing.count++;
      } else {
        byStatus.set(status.id, {
          statusId: status.id,
          statusName: status.name,
          statusCategory: status.statusCategory.key,
          count: 1,
        });
      }
    }
    return Array.from(byStatus.values()).sort((a, b) => {
      const catDiff = (CATEGORY_ORDER[a.statusCategory] ?? 1) - (CATEGORY_ORDER[b.statusCategory] ?? 1);
      if (catDiff !== 0) return catDiff;
      return a.statusName.localeCompare(b.statusName);
    });
  }, [boardIssues]);

  const epicGroups: EpicGroup[] = useMemo(() => {
    const groups = new Map<string, EpicGroup>();

    for (const issue of boardIssues) {
      const epicRef = findEpicRef(issue, issueMap);
      const key = epicRef?.key ?? UNASSIGNED_EPIC_KEY;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          summary: epicRef?.summary ?? "No epic",
          color: UNASSIGNED_EPIC_COLOR,
          total: 0,
          byStatus: new Map(),
        };
        groups.set(key, group);
      }

      group.total++;
      const bucket = group.byStatus.get(issue.fields.status.id);
      if (bucket) bucket.push(issue);
      else group.byStatus.set(issue.fields.status.id, [issue]);
    }

    // Stable epic accent colors, cycling the same palette the graph view uses.
    const realEpicKeys = Array.from(groups.keys())
      .filter((k) => k !== UNASSIGNED_EPIC_KEY)
      .sort((a, b) => (groups.get(a)!.summary).localeCompare(groups.get(b)!.summary));
    realEpicKeys.forEach((key, i) => {
      groups.get(key)!.color = EPIC_COLORS[i % EPIC_COLORS.length];
    });

    const ordered = realEpicKeys.map((k) => groups.get(k)!);
    const unassigned = groups.get(UNASSIGNED_EPIC_KEY);
    if (unassigned) ordered.push(unassigned);
    return ordered;
  }, [boardIssues, issueMap]);

  if (boardIssues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
        No issues to display.
      </div>
    );
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-slate-950 px-4 pb-4">
      {/* flex + justify-center centers the panel when it's narrower than the viewport;
          w-fit + min-w-full let the row grow past 100% and fall back to natural
          left-aligned scrolling (instead of clipping) once the board overflows.
          No top padding here — position:sticky pins to this container's own
          padding edge, but ordinary (non-sticky) content can still scroll
          through that reserved strip, so any top padding here would leave a
          gap the header doesn't fully cover as cards scroll past it. */}
      <div className="flex justify-center w-fit min-w-full">
        {/* The panel itself stays page-colored — each column paints its own
            slate-100 background, so the 12px gap between columns genuinely
            shows a different (page) color rather than being invisible empty
            space inside a uniformly-colored panel. No top padding for the
            reason noted above — the sticky header is a direct descendant and
            must start flush with this panel's top edge. */}
        <div className="px-3 pb-3">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${columns.length}, ${COL_WIDTH}px)`, columnGap: COL_GAP }}>
          {/* Column headers — shared across every epic group below. The grid's
              columnGap is meant to separate card columns, not the heading, so
              each header (but the last) bleeds across it with a negative
              margin, making the header read as one continuous bar. */}
          {columns.map((col, i) => {
            const dotColor = STATUS_COLORS[col.statusCategory] ?? STATUS_COLORS.new;
            return (
              <div
                key={col.statusId}
                className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-700/80"
                style={i < columns.length - 1 ? { marginRight: -COL_GAP } : undefined}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 truncate">
                  {col.statusName}
                </span>
                <span className="ml-auto text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded-md tabular-nums shrink-0">
                  {col.count}
                </span>
              </div>
            );
          })}

          {/* Epic groups — each is a full-width bar followed by one cell per column */}
          {epicGroups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className="contents">
                <div
                  className="flex items-center gap-2 px-3 py-2 mt-3 rounded-md bg-slate-200/70 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-800"
                  style={{ gridColumn: `1 / span ${columns.length}` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(group.key)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <span
                      className="text-slate-400 dark:text-slate-500 text-[10px] shrink-0 transition-transform"
                      style={{ transform: isCollapsed ? "rotate(-90deg)" : undefined }}
                    >
                      ▾
                    </span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color.border }} />
                    {group.key !== UNASSIGNED_EPIC_KEY && (
                      <span className="text-[11px] font-mono font-bold shrink-0" style={{ color: group.color.border }}>
                        {group.key}
                      </span>
                    )}
                    {group.key !== UNASSIGNED_EPIC_KEY ? (
                      <span
                        role="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onIssueSelect?.(group.key);
                        }}
                        className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {group.summary}
                      </span>
                    ) : (
                      <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {group.summary}
                      </span>
                    )}
                  </button>
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                    {group.total}
                  </span>
                </div>

                {!isCollapsed &&
                  columns.map((col) => (
                    <div key={col.statusId} className="flex flex-col gap-2 p-2 bg-slate-100 dark:bg-slate-900">
                      {(group.byStatus.get(col.statusId) ?? []).map((issue) => (
                        <KanbanCard
                          key={issue.key}
                          issue={issue}
                          selected={selectedKey === issue.key}
                          onClick={() => onIssueSelect?.(issue.key)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  issue: JiraIssue;
  selected: boolean;
  onClick: () => void;
}

function KanbanCard({ issue, selected, onClick }: KanbanCardProps) {
  const typeInfo = ISSUE_TYPE_LABEL[issue.fields.issuetype.name] ?? {
    short: issue.fields.issuetype.name,
    color: "#64748b",
    bg: "#f1f5f9",
  };
  const cat = issue.fields.status.statusCategory.key;
  const dotColor = STATUS_COLORS[cat] ?? STATUS_COLORS.new;
  const subtasks = issue.fields.subtasks ?? [];
  const created = formatCreated(issue.fields.created);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={[
        "text-left rounded-lg border bg-white dark:bg-slate-800 p-2.5 cursor-pointer transition-[box-shadow,border-color,transform] duration-150 shrink-0",
        "hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_#a5b4fc,_0_6px_16px_rgba(99,102,241,0.12)]",
        selected
          ? "border-indigo-300 dark:border-indigo-600 shadow-[0_0_0_2px_#6366f1]"
          : "border-slate-200/80 dark:border-slate-700/80 shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-mono font-semibold text-slate-400 dark:text-slate-500 truncate">
          {issue.key}
        </span>
        {issue.fields.assignee ? (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ background: "#6366f1" }}
            title={issue.fields.assignee.displayName}
          >
            {avatarInitials(issue.fields.assignee.displayName)}
          </span>
        ) : (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
            title="Unassigned"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.5h19.6v-2.5c0-3.3-6.5-4.9-9.8-4.9Z" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex items-start gap-1.5 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: dotColor }} />
        <span className="text-[12.5px] font-medium leading-snug line-clamp-3 text-slate-800 dark:text-slate-100">
          {issue.fields.summary}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
          data-issue-type={issue.fields.issuetype.name}
          style={{ color: typeInfo.color, background: typeInfo.bg }}
        >
          {typeInfo.short}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {subtasks.length > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
              style={{ color: "#0369a1", background: "#e0f2fe" }}
              title={`${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}`}
            >
              ↳ {subtasks.length}
            </span>
          )}
          {created && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0" title="Created">
              {created}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
