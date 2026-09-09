"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { JiraIssue, JiraUser } from "@/lib/jira";
import { STATUS_COLORS, ISSUE_TYPE_LABEL, ISSUE_TYPE_FALLBACK } from "@/lib/graphConstants";
import CardMenu from "./CardMenu";
import AssigneePicker, { avatarColor, avatarInitials } from "./AssigneePicker";

function formatCreated(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CARD_BASE_CLASS =
  "text-left rounded-lg border bg-card p-2.5 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/** The card's visual body, shared between the in-list draggable card and the floating DragOverlay clone. */
export function KanbanCardBody({
  issue,
  menu,
  onAssign,
  teamMembers = [],
}: {
  issue: JiraIssue;
  menu?: ReactNode;
  onAssign?: (user: JiraUser | null) => void;
  teamMembers?: JiraUser[];
}) {
  const typeInfo = ISSUE_TYPE_LABEL[issue.fields.issuetype.name] ?? {
    short: issue.fields.issuetype.name,
    ...ISSUE_TYPE_FALLBACK,
  };
  const cat = issue.fields.status.statusCategory.key;
  const dotColor = STATUS_COLORS[cat] ?? STATUS_COLORS.new;
  const subtasks = issue.fields.subtasks ?? [];
  const created = formatCreated(issue.fields.created);

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-mono font-semibold text-muted-foreground truncate">
          {issue.key}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {menu}
          {onAssign ? (
            <AssigneePicker issue={issue} onAssign={onAssign} teamMembers={teamMembers} />
          ) : issue.fields.assignee ? (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ background: avatarColor(issue.fields.assignee.displayName) }}
              title={issue.fields.assignee.displayName}
            >
              {avatarInitials(issue.fields.assignee.displayName)}
            </span>
          ) : (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-accent text-muted-foreground"
              title="Unassigned"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.5h19.6v-2.5c0-3.3-6.5-4.9-9.8-4.9Z" />
              </svg>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-1.5 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: dotColor }} />
        <span className="text-[12.5px] font-medium leading-snug line-clamp-3 text-foreground">
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
              style={{ color: "var(--type-task-color)", background: "var(--type-task-bg)" }}
              title={`${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}`}
            >
              ↳ {subtasks.length}
            </span>
          )}
          {created && (
            <span className="text-[10px] text-muted-foreground shrink-0" title="Created">
              {created}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/** Static clone rendered inside dnd-kit's DragOverlay while a card is being dragged. */
export function KanbanCardOverlay({ issue }: { issue: JiraIssue }) {
  return (
    <div
      className={[CARD_BASE_CLASS, "border-primary rotate-2 shadow-xl cursor-grabbing"].join(" ")}
      style={{ width: 236 }}
    >
      <KanbanCardBody issue={issue} />
    </div>
  );
}

interface KanbanCardProps {
  issue: JiraIssue;
  selected: boolean;
  onClick: () => void;
  /** True while this card's own move is in flight — dims it and blocks re-dragging until it resolves. */
  pending?: boolean;
  onEdit?: () => void;
  onCloseIssue?: () => void;
  onDelete?: () => void;
  onAssign?: (user: JiraUser | null) => void;
  teamMembers?: JiraUser[];
  /** True while any card on the board is being dragged — suppresses hover repaint on cards the pointer sweeps past mid-drag. */
  dragActive?: boolean;
}

export default function KanbanCard({
  issue,
  selected,
  onClick,
  pending,
  onEdit,
  onCloseIssue,
  onDelete,
  onAssign,
  teamMembers,
  dragActive,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.key,
    disabled: pending,
  });

  const menu =
    onEdit && onCloseIssue && onDelete ? (
      <CardMenu onEdit={onEdit} onClose={onCloseIssue} onDelete={onDelete} />
    ) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      // Prevents the browser's default click-to-focus scrollIntoView nudge —
      // Chromium grants focus during pointerdown's default action, so we must
      // preventDefault() there. But dnd-kit's own pointerdown handler (from
      // `listeners`, called first below) bails out of activating a drag if it
      // sees event.defaultPrevented — so preventDefault() has to run *after*
      // dnd-kit has already inspected the event, not before (a capture-phase
      // handler that ran first silently disabled dragging entirely). Keyboard
      // focus (Tab) is unaffected either way.
      onPointerDown={(e) => {
        listeners?.onPointerDown?.(e);
        e.preventDefault();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      style={{
        opacity: isDragging || pending ? 0.4 : 1,
        touchAction: "none",
      }}
      className={[
        CARD_BASE_CLASS,
        // select-none matters more than it looks: without it, moving the pointer
        // inside the drag-activation deadzone (before dnd-kit registers a drag)
        // lets the browser start a native text selection, which reads as sticky/
        // laggy resistance right at the moment you try to pick a card up.
        "select-none group cursor-grab active:cursor-grabbing",
        dragActive
          ? "border-border"
          : [
              "transition-[box-shadow,border-color,transform] duration-150",
              "hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_var(--accent-focus-ring-hover),_0_6px_16px_var(--accent-focus-ring-shadow)]",
              selected ? "border-primary shadow-[0_0_0_2px_var(--accent-focus-ring)]" : "border-border",
            ].join(" "),
      ].join(" ")}
    >
      <KanbanCardBody issue={issue} menu={menu} onAssign={onAssign} teamMembers={teamMembers} />
    </div>
  );
}
