"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { JiraIssue, JiraIssueType, JiraStatus, JiraUser } from "@/lib/jira";
import { STATUS_COLORS, EPIC_COLORS, UNASSIGNED_EPIC_COLOR, UNASSIGNED_EPIC_KEY } from "@/lib/graphConstants";
import {
  moveIssue,
  createIssue,
  fetchPermissions,
  transitionIssueById,
  deleteIssueRequest,
  assignIssue,
} from "@/hooks/useIssueMutations";
import KanbanColumn from "./KanbanColumn";
import { KanbanCardOverlay } from "./KanbanCard";
import { useToasts, ToastStack } from "./Toast";
import EditIssueDialog from "./EditIssueDialog";
import CreateIssueDialog from "./CreateIssueDialog";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Category order — matches Jira's default board layout (To Do → In Progress → Done). */
const CATEGORY_ORDER: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };

const COL_WIDTH = 260;
const COL_GAP = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
): { key: string; summary: string; isDone: boolean } | null {
  let current: JiraIssue | undefined = issue;
  while (current) {
    const parent = current.fields.parent;
    if (!parent) return null;
    if (parent.fields.issuetype.name === "Epic") {
      return {
        key: parent.key,
        summary: parent.fields.summary,
        isDone: parent.fields.status.statusCategory.key === "done",
      };
    }
    current = issueMap.get(parent.key);
  }
  return null;
}

function cellId(epicKey: string, statusId: string): string {
  return `${epicKey}::${statusId}`;
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
  /** Epic's own status is "Done" — as opposed to all its children merely being done. */
  isDone: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  issues: JiraIssue[];
  onIssueSelect?: (key: string) => void;
  selectedKey?: string | null;
  projectKey: string;
}

export default function KanbanBoard({ issues, onIssueSelect, selectedKey, projectKey }: KanbanBoardProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Epics the user has explicitly expanded/collapsed — once touched, a group's
  // done-ness no longer drives its collapsed state, so an intentional "let me
  // look at this finished epic" choice doesn't get clobbered by the
  // auto-collapse effect below on the next render or poll.
  const userToggledRef = useRef<Set<string>>(new Set());

  // Local mirror of `issues`, mutated optimistically on drag-and-drop. Keys in
  // pendingRef are currently mid-mutation — the poll-driven `issues` prop must
  // not clobber those until the in-flight request resolves one way or another.
  const [localIssues, setLocalIssues] = useState<JiraIssue[]>(issues);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const revertSnapshotRef = useRef<Map<string, JiraIssue>>(new Map());
  const [activeIssue, setActiveIssue] = useState<JiraIssue | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [createEpicKey, setCreateEpicKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalIssues((prev) => {
      if (pendingRef.current.size === 0) return issues;
      const prevByKey = new Map(prev.map((i) => [i.key, i]));
      return issues.map((incoming) =>
        pendingRef.current.has(incoming.key) ? (prevByKey.get(incoming.key) ?? incoming) : incoming,
      );
    });
  }, [issues]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const boardIssues = useMemo(() => localIssues.filter((i) => isBoardable(i.fields.issuetype)), [localIssues]);
  const issueMap = useMemo(() => new Map(boardIssues.map((i) => [i.key, i])), [boardIssues]);

  // Everyone already assigned to something on this board — the assignee picker's
  // default suggestions, so it doesn't dump the whole org on you before you search.
  const teamMembers = useMemo(() => {
    const byId = new Map<string, JiraUser>();
    for (const issue of boardIssues) {
      const a = issue.fields.assignee;
      if (a) byId.set(a.accountId, a);
    }
    return Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [boardIssues]);

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

  // Quick-create always lands in the "To Do"-category column, matching where
  // Jira's own create screen puts a fresh issue for almost every workflow.
  const firstTodoColumnId = useMemo(
    () => columns.find((c) => c.statusCategory === "new")?.statusId ?? columns[0]?.statusId,
    [columns],
  );

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
          isDone: epicRef?.isDone ?? false,
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

  // Done epics start collapsed so finished work doesn't crowd the board —
  // opt in per-epic (via toggleCollapsed) to look at one anyway.
  useEffect(() => {
    setCollapsed((prev) => {
      let next: Set<string> | null = null;
      for (const group of epicGroups) {
        if (group.isDone && !userToggledRef.current.has(group.key) && !prev.has(group.key)) {
          if (!next) next = new Set(prev);
          next.add(group.key);
        }
      }
      return next ?? prev;
    });
  }, [epicGroups]);

  function toggleCollapsed(key: string) {
    userToggledRef.current.add(key);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const issue = issueMap.get(String(event.active.id));
    setActiveIssue(issue ?? null);
  }

  function handleDragCancel() {
    setActiveIssue(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;

    const issueKey = String(active.id);
    const issue = issueMap.get(issueKey);
    if (!issue) return;

    const [targetEpicKey, targetStatusId] = String(over.id).split("::");
    const sourceEpicRef = findEpicRef(issue, issueMap);
    const sourceEpicKey = sourceEpicRef?.key ?? UNASSIGNED_EPIC_KEY;

    // Confine drag-and-drop to one swimlane, same as Jira's own board — an
    // issue's epic is derived from its parent link, not something a status
    // drop can change, so a cross-epic drop is simply not a valid move.
    if (targetEpicKey !== sourceEpicKey) return;
    if (targetStatusId === issue.fields.status.id) return;

    const targetColumn = columns.find((c) => c.statusId === targetStatusId);
    if (!targetColumn) return;

    const originalIssue = issue;
    const optimisticStatus: JiraStatus = {
      id: targetColumn.statusId,
      name: targetColumn.statusName,
      statusCategory: { id: 0, key: targetColumn.statusCategory, name: targetColumn.statusCategory },
    };

    revertSnapshotRef.current.set(issueKey, originalIssue);
    pendingRef.current.add(issueKey);
    setPendingKeys(new Set(pendingRef.current));
    setLocalIssues((prev) =>
      prev.map((i) => (i.key === issueKey ? { ...i, fields: { ...i.fields, status: optimisticStatus } } : i)),
    );

    try {
      await moveIssue(issueKey, targetStatusId);
    } catch (err) {
      // Revert on failure — permission denied, no matching transition, or a network error.
      const original = revertSnapshotRef.current.get(issueKey);
      if (original) {
        setLocalIssues((prev) => prev.map((i) => (i.key === issueKey ? original : i)));
      }
      push(err instanceof Error ? err.message : "Failed to move issue.");
    } finally {
      pendingRef.current.delete(issueKey);
      revertSnapshotRef.current.delete(issueKey);
      setPendingKeys(new Set(pendingRef.current));
    }
  }

  async function handleCreate(
    epicKey: string,
    input: { summary: string; issueType: JiraIssueType; description?: string },
  ) {
    const group = epicGroups.find((g) => g.key === epicKey);
    const todoColumn = columns.find((c) => c.statusCategory === "new") ?? columns[0];

    const created = await createIssue({
      projectKey,
      issueTypeId: input.issueType.id,
      summary: input.summary,
      description: input.description,
      parentKey: epicKey === UNASSIGNED_EPIC_KEY ? undefined : epicKey,
    });

    // Build a reasonable placeholder immediately — the next 30s poll fills in
    // any field Jira computed differently (e.g. a workflow's real initial status).
    const placeholder: JiraIssue = {
      id: created.id,
      key: created.key,
      fields: {
        summary: input.summary,
        status: {
          id: todoColumn?.statusId ?? "0",
          name: todoColumn?.statusName ?? "To Do",
          statusCategory: { id: 0, key: todoColumn?.statusCategory ?? "new", name: todoColumn?.statusCategory ?? "new" },
        },
        issuetype: input.issueType,
        assignee: null,
        parent:
          epicKey !== UNASSIGNED_EPIC_KEY && group
            ? {
                id: epicKey,
                key: epicKey,
                fields: { summary: group.summary, issuetype: { id: "", name: "Epic", subtask: false }, status: { id: "", name: "", statusCategory: { id: 0, key: group.isDone ? "done" : "new", name: "" } } },
              }
            : undefined,
        issuelinks: [],
      },
    };
    setLocalIssues((prev) => [placeholder, ...prev]);
  }

  async function handleCloseIssue(issueKey: string) {
    pendingRef.current.add(issueKey);
    setPendingKeys(new Set(pendingRef.current));
    try {
      const { transitions } = await fetchPermissions(issueKey);
      const doneTransition = transitions.find((t) => t.to.statusCategory.key === "done" && t.isAvailable !== false);
      if (!doneTransition) {
        push("No transition to a Done status is available to you for this issue.");
        return;
      }
      await transitionIssueById(issueKey, doneTransition.id);
      setLocalIssues((prev) =>
        prev.map((i) => (i.key === issueKey ? { ...i, fields: { ...i.fields, status: doneTransition.to } } : i)),
      );
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to close issue.");
    } finally {
      pendingRef.current.delete(issueKey);
      setPendingKeys(new Set(pendingRef.current));
    }
  }

  async function handleAssign(issueKey: string, user: JiraUser | null) {
    const original = issueMap.get(issueKey);
    if (!original) return;
    pendingRef.current.add(issueKey);
    setPendingKeys(new Set(pendingRef.current));
    setLocalIssues((prev) =>
      prev.map((i) => (i.key === issueKey ? { ...i, fields: { ...i.fields, assignee: user } } : i)),
    );
    try {
      await assignIssue(issueKey, user?.accountId ?? null);
    } catch (err) {
      setLocalIssues((prev) => prev.map((i) => (i.key === issueKey ? original : i)));
      push(err instanceof Error ? err.message : "Failed to assign issue.");
    } finally {
      pendingRef.current.delete(issueKey);
      setPendingKeys(new Set(pendingRef.current));
    }
  }

  async function handleDeleteIssue(issueKey: string) {
    if (!window.confirm(`Delete ${issueKey}? This can't be undone.`)) return;
    pendingRef.current.add(issueKey);
    setPendingKeys(new Set(pendingRef.current));
    try {
      await deleteIssueRequest(issueKey);
      setLocalIssues((prev) => prev.filter((i) => i.key !== issueKey));
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete issue.");
    } finally {
      pendingRef.current.delete(issueKey);
      setPendingKeys(new Set(pendingRef.current));
    }
  }

  function handleSaved(issueKey: string, patch: { summary?: string; status?: JiraStatus; assignee?: JiraIssue["fields"]["assignee"] }) {
    setLocalIssues((prev) =>
      prev.map((i) =>
        i.key === issueKey
          ? {
              ...i,
              fields: {
                ...i.fields,
                ...(patch.summary ? { summary: patch.summary } : {}),
                ...(patch.status ? { status: patch.status } : {}),
                ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
              },
            }
          : i,
      ),
    );
  }

  const editingIssue = editingKey ? issueMap.get(editingKey) : undefined;

  if (boardIssues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        No issues to display.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex-1 min-h-0 overflow-auto bg-popover px-4 pb-4">
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
                    className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-muted border-b border-border"
                    style={i < columns.length - 1 ? { marginRight: -COL_GAP } : undefined}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                    <span className="text-[13px] font-bold text-foreground truncate">
                      {col.statusName}
                    </span>
                    <span className="ml-auto text-[11px] font-semibold text-muted-foreground bg-accent/70 px-1.5 py-0.5 rounded-md tabular-nums shrink-0">
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
                      className={[
                        "flex items-center gap-2 px-3 py-2 mt-3 rounded-md hover:bg-accent",
                        group.isDone
                          ? "bg-accent/50"
                          : "bg-accent/70",
                      ].join(" ")}
                      style={{ gridColumn: `1 / span ${columns.length}` }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(group.key)}
                        className={["flex items-center gap-2 min-w-0 flex-1 text-left", group.isDone ? "opacity-70" : ""].join(" ")}
                      >
                        <span
                          className="text-muted-foreground text-[10px] shrink-0 transition-transform"
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
                            className={[
                              "text-[13px] font-semibold truncate hover:underline hover:text-primary",
                              group.isDone ? "text-muted-foreground line-through decoration-slate-400/60" : "text-foreground",
                            ].join(" ")}
                          >
                            {group.summary}
                          </span>
                        ) : (
                          <span className="text-[13px] font-semibold text-foreground truncate">
                            {group.summary}
                          </span>
                        )}
                        {group.isDone && (
                          <span
                            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide shrink-0"
                            style={{ color: STATUS_COLORS.done, background: "var(--status-done-bg)" }}
                            title="Epic is done"
                          >
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M3 8.5 6.2 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Done
                          </span>
                        )}
                      </button>
                      <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">
                        {group.total}
                      </span>
                    </div>

                    {!isCollapsed &&
                      columns.map((col) => (
                        <KanbanColumn
                          key={col.statusId}
                          id={cellId(group.key, col.statusId)}
                          issues={group.byStatus.get(col.statusId) ?? []}
                          selectedKey={selectedKey}
                          onIssueSelect={onIssueSelect}
                          pendingKeys={pendingKeys}
                          onOpenCreate={col.statusId === firstTodoColumnId ? () => setCreateEpicKey(group.key) : undefined}
                          onEditIssue={setEditingKey}
                          onCloseIssue={handleCloseIssue}
                          onDeleteIssue={handleDeleteIssue}
                          onAssignIssue={handleAssign}
                          teamMembers={teamMembers}
                          dragActive={activeIssue !== null}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeIssue ? <KanbanCardOverlay issue={activeIssue} /> : null}
      </DragOverlay>

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      {editingIssue && (
        <EditIssueDialog
          issue={editingIssue}
          onClose={() => setEditingKey(null)}
          onSaved={(patch) => handleSaved(editingIssue.key, patch)}
          onError={push}
        />
      )}

      {createEpicKey && (
        <CreateIssueDialog
          projectKey={projectKey}
          epicSummary={
            createEpicKey === UNASSIGNED_EPIC_KEY
              ? null
              : (epicGroups.find((g) => g.key === createEpicKey)?.summary ?? null)
          }
          onClose={() => setCreateEpicKey(null)}
          onCreate={async (input) => {
            try {
              await handleCreate(createEpicKey, input);
            } catch (err) {
              push(err instanceof Error ? err.message : "Failed to create issue.");
              throw err;
            }
          }}
        />
      )}
    </DndContext>
  );
}
