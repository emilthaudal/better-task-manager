"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { IssueNodeData } from "@/lib/graphConstants";

const ISSUE_TYPE_LABEL: Record<string, { short: string; color: string; bg: string }> = {
  Story:   { short: "Story",   color: "#0891b2", bg: "#e0f9ff" },
  Bug:     { short: "Bug",     color: "#dc2626", bg: "#fee2e2" },
  Task:    { short: "Task",    color: "#0369a1", bg: "#e0f2fe" },
  Subtask: { short: "Sub",     color: "#0369a1", bg: "#e0f2fe" },
  Epic:    { short: "Epic",    color: "#d97706", bg: "#fef3c7" },
};

/** Orange accent for external-dependency tasks — overrides the status border color. */
const EXTERNAL_BORDER_COLOR = "#f97316"; // orange-500

/** Rose accent for tasks stuck behind an unresolved blocker — overrides the status border color. */
const BLOCKED_BORDER_COLOR = "#e11d48"; // rose-600

function avatarInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

type IssueNodeType = Node<IssueNodeData, "issueNode">;

/** Small check glyph used to mark completed cards — a shape reads at a distance where a color hue doesn't. */
function DoneCheck({ size }: { size: number }) {
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: "#16a34a" }}
    >
      <svg viewBox="0 0 12 12" style={{ width: size * 0.6, height: size * 0.6 }}>
        <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Small stop-flag glyph used to mark cards stuck behind an unresolved blocker. */
function BlockedFlag({ size }: { size: number }) {
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: BLOCKED_BORDER_COLOR }}
    >
      <svg viewBox="0 0 12 12" style={{ width: size * 0.6, height: size * 0.6 }}>
        <path d="M6 2v5" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <circle cx="6" cy="9.5" r="0.9" fill="#fff" />
      </svg>
    </span>
  );
}

function IssueNode({ data, selected }: NodeProps<IssueNodeType>) {
  const isDone = data.statusCategory === "done";
  // A done task is never shown as blocked, even if a stale blocker link lingers.
  const isBlocked = data.isBlocked && !isDone;

  // External tasks get an orange border regardless of status; standalone epics stay amber;
  // blocked tasks get a rose border so the stop-flag treatment reads on the stripe too.
  const borderColor = data.isExternal
    ? EXTERNAL_BORDER_COLOR
    : data.isEpicStandalone
      ? "#fbbf24"
      : isBlocked
        ? BLOCKED_BORDER_COLOR
        : data.bgColor;

  // ── Compact chip for subtask nodes ───────────────────────────────────────
  // Subtasks that live inside a taskGroupNode render as compact title-only chips.
  // Subtasks placed directly inside a storyGroupNode (insideGroup: false) get the
  // full card treatment so they show status, assignee, and connection handles for
  // dependency edges — they are first-class nodes in the graph, not indented chips.
  if (data.isSubtask && data.insideGroup) {
    return (
      <div
        style={{
          borderLeft: `4px solid ${borderColor}`,
          width: 220,
          boxShadow: selected
            ? `0 0 0 2px #6366f1, 0 4px 16px rgba(99,102,241,0.18), 0 1px 4px rgba(0,0,0,0.08)`
            : "0 1px 3px rgba(0,0,0,0.07), 0 4px 10px rgba(0,0,0,0.05)",
        }}
        className={`${isDone ? "bg-emerald-50/70 dark:bg-emerald-950/30" : isBlocked ? "bg-rose-50/70 dark:bg-rose-950/30" : "bg-white dark:bg-slate-800"} rounded-lg overflow-hidden transition-[box-shadow,border-color,opacity,transform] duration-150 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_#a5b4fc,_0_6px_16px_rgba(99,102,241,0.12)] hover:border-indigo-200/80 dark:hover:border-indigo-600/60 px-2.5 py-1.5`}
      >
        <div className="flex items-center gap-1.5">
          {isDone && <DoneCheck size={13} />}
          {isBlocked && <BlockedFlag size={13} />}
          {data.isExternal && (
            <span
              className="text-[9px] font-semibold px-1 py-0.5 rounded tracking-wide shrink-0"
              data-external="true"
              style={{ color: "#9a3412", background: "#ffedd5" }}
            >
              ↗ Ext
            </span>
          )}
          <div
            className={`text-[12px] font-medium leading-snug line-clamp-2 ${isDone || isBlocked ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}
          >
            {data.summary}
          </div>
        </div>
      </div>
    );
  }

  // ── Full card for regular task / epic nodes ───────────────────────────────
  const typeInfo = ISSUE_TYPE_LABEL[data.issueType] ?? { short: data.issueType, color: "#64748b", bg: "#f1f5f9" };
  const width = data.isEpicStandalone ? 320 : 280;
  const cardBg = data.isEpicStandalone
    ? "bg-amber-50/40 dark:bg-amber-950/20"
    : isDone
      ? "bg-emerald-50/60 dark:bg-emerald-950/25"
      : isBlocked
        ? "bg-rose-50/60 dark:bg-rose-950/25"
        : "bg-white dark:bg-slate-800";

  return (
    <>
      {/* Only render handles for nodes that are NOT inside a group container.
          Grouped nodes (parent tasks + their subtasks) use the group container's
          handles so dependency edges enter/exit at the true top/bottom of the
          group, never passing through the sub-task area. */}
      {!data.insideGroup && (
        <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
      )}

      <div
        style={{
          borderLeft: `4px solid ${borderColor}`,
          width,
          boxShadow: selected
            ? `0 0 0 2px #6366f1, 0 4px 20px rgba(99,102,241,0.18), 0 1px 4px rgba(0,0,0,0.08)`
            : "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.06)",
        }}
        className={`${cardBg} rounded-xl flex flex-col overflow-hidden transition-[box-shadow,border-color,opacity,transform] duration-150 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_#a5b4fc,_0_6px_20px_rgba(99,102,241,0.15),_0_1px_4px_rgba(0,0,0,0.08)] hover:border-indigo-200/80 dark:hover:border-indigo-600/60`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Type pill — data-issue-type attr lets globals.css override colors in dark mode */}
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
              data-issue-type={data.issueType}
              style={{ color: typeInfo.color, background: typeInfo.bg }}
            >
              {typeInfo.short}
            </span>
            {/* External badge */}
            {data.isExternal && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
                data-external="true"
                style={{ color: "#9a3412", background: "#ffedd5" }}
              >
                ↗ External
              </span>
            )}
          </div>
          {/* Issue key */}
          <span className="text-[11px] font-mono font-semibold text-slate-400 dark:text-slate-500 shrink-0">
            {data.key}
          </span>
        </div>

        {/* Summary */}
        <div
          className={`px-3 pb-2 text-[13px] font-medium leading-snug line-clamp-2 ${isDone || isBlocked ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}
        >
          {data.summary}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 pb-2.5 gap-2 mt-auto">
          {/* Status */}
          {isDone ? (
            <span className="flex items-center gap-1.5">
              <DoneCheck size={15} />
            </span>
          ) : isBlocked ? (
            <span className="flex items-center gap-1.5">
              <BlockedFlag size={15} />
            </span>
          ) : (
            <span
              className="text-[10px] font-semibold flex items-center gap-1"
              style={{ color: data.textColor }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: data.bgColor }}
              />
              {data.statusName}
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {/* Subtask count badge */}
            {data.subtaskCount != null && data.subtaskCount > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#0369a1", background: "#e0f2fe" }}
                title={`${data.subtaskCount} subtask${data.subtaskCount === 1 ? "" : "s"}`}
              >
                ↳ {data.subtaskCount}
              </span>
            )}

            {/* Cross-epic outgoing badge — this node blocks tasks in another epic */}
            {data.crossEpicOut != null && data.crossEpicOut > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#9a3412", background: "#ffedd5" }}
                title={`Blocks ${data.crossEpicOut} task${data.crossEpicOut === 1 ? "" : "s"} in another epic`}
              >
                ↗ {data.crossEpicOut}
              </span>
            )}

            {/* Cross-epic incoming badge — this node is blocked by tasks in another epic */}
            {data.crossEpicIn != null && data.crossEpicIn > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#991b1b", background: "#fee2e2" }}
                title={`Blocked by ${data.crossEpicIn} task${data.crossEpicIn === 1 ? "" : "s"} in another epic`}
              >
                ↙ {data.crossEpicIn}
              </span>
            )}

            {/* Cross-story outgoing badge — this node blocks tasks in another story */}
            {data.crossStoryOut != null && data.crossStoryOut > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#9a3412", background: "#ffedd5" }}
                title={`Blocks ${data.crossStoryOut} task${data.crossStoryOut === 1 ? "" : "s"} in another story`}
              >
                ↗ {data.crossStoryOut}
              </span>
            )}

            {/* Cross-story incoming badge — this node is blocked by tasks in another story */}
            {data.crossStoryIn != null && data.crossStoryIn > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide flex items-center gap-0.5"
                style={{ color: "#991b1b", background: "#fee2e2" }}
                title={`Blocked by ${data.crossStoryIn} task${data.crossStoryIn === 1 ? "" : "s"} in another story`}
              >
                ↙ {data.crossStoryIn}
              </span>
            )}

            {/* Assignee avatar */}
            {data.assignee && (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ background: "#6366f1" }}
                title={data.assignee}
              >
                {avatarInitials(data.assignee)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!data.insideGroup && (
        <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2 !border-white !border-2" />
      )}
    </>
  );
}

export default memo(IssueNode);
