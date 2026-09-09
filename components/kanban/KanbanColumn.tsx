"use client";

import { useDroppable } from "@dnd-kit/core";
import type { JiraIssue } from "@/lib/jira";
import KanbanCard from "./KanbanCard";
import QuickAddRow from "./QuickAddRow";

interface KanbanColumnProps {
  /** Droppable id: `${epicKey}::${statusId}` — scopes drag-and-drop to one swimlane, matching Jira's own board behavior. */
  id: string;
  issues: JiraIssue[];
  selectedKey?: string | null;
  onIssueSelect?: (key: string) => void;
  pendingKeys: Set<string>;
  /** Present only on the first "To Do"-category column of each swimlane. */
  onCreate?: (summary: string) => Promise<void>;
  onEditIssue?: (key: string) => void;
  onCloseIssue?: (key: string) => void;
  onDeleteIssue?: (key: string) => void;
}

export default function KanbanColumn({
  id,
  issues,
  selectedKey,
  onIssueSelect,
  pendingKeys,
  onCreate,
  onEditIssue,
  onCloseIssue,
  onDeleteIssue,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col gap-2 p-2 rounded-md transition-colors",
        isOver ? "bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700" : "bg-slate-100 dark:bg-slate-900",
      ].join(" ")}
    >
      {onCreate && <QuickAddRow onSubmit={onCreate} />}
      {issues.map((issue) => (
        <KanbanCard
          key={issue.key}
          issue={issue}
          selected={selectedKey === issue.key}
          onClick={() => onIssueSelect?.(issue.key)}
          pending={pendingKeys.has(issue.key)}
          onEdit={onEditIssue ? () => onEditIssue(issue.key) : undefined}
          onCloseIssue={onCloseIssue ? () => onCloseIssue(issue.key) : undefined}
          onDelete={onDeleteIssue ? () => onDeleteIssue(issue.key) : undefined}
        />
      ))}
    </div>
  );
}
