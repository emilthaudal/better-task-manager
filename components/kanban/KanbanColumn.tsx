"use client";

import { useDroppable } from "@dnd-kit/core";
import type { JiraIssue } from "@/lib/jira";
import KanbanCard from "./KanbanCard";

interface KanbanColumnProps {
  /** Droppable id: `${epicKey}::${statusId}` — scopes drag-and-drop to one swimlane, matching Jira's own board behavior. */
  id: string;
  issues: JiraIssue[];
  selectedKey?: string | null;
  onIssueSelect?: (key: string) => void;
  pendingKeys: Set<string>;
}

export default function KanbanColumn({ id, issues, selectedKey, onIssueSelect, pendingKeys }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col gap-2 p-2 rounded-md transition-colors",
        isOver ? "bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700" : "bg-slate-100 dark:bg-slate-900",
      ].join(" ")}
    >
      {issues.map((issue) => (
        <KanbanCard
          key={issue.key}
          issue={issue}
          selected={selectedKey === issue.key}
          onClick={() => onIssueSelect?.(issue.key)}
          pending={pendingKeys.has(issue.key)}
        />
      ))}
    </div>
  );
}
