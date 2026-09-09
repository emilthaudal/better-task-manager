import type { Node, Edge } from "@xyflow/react";

// ── Layout constants ──────────────────────────────────────────────────────────

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 112;

// Subtask grouping layout constants
export const SUBTASK_NODE_WIDTH = 220;
export const SUBTASK_NODE_HEIGHT = 52;
export const GROUP_PADDING_X = 20;
export const GROUP_PADDING_TOP = 8;
export const GROUP_PADDING_BOT = 8;
export const GROUP_INNER_GAP = 6;    // tight gap for compact chips
export const GROUP_LEFT_INDENT = 60; // how far subtasks are indented from the left of the group

// Epic group container layout constants
export const EPIC_PADDING_X = 32;
export const EPIC_PADDING_TOP = 52; // extra room for the header bar
export const EPIC_PADDING_BOT = 32;
export const EPIC_NODE_GAP = 24;    // gap between child nodes inside an epic group

// Story group container layout constants
export const STORY_PADDING_X = 20;
export const STORY_PADDING_TOP = 36; // room for the story label header
export const STORY_PADDING_BOT = 20;
export const STORY_NODE_GAP = 16;    // gap between child nodes inside a story group

// Synthetic key for tasks with no epic parent
export const UNASSIGNED_EPIC_KEY = "__unassigned__";

// Jira label that marks a task as having an external dependency
export const EXTERNAL_LABEL = "external";

// ── Color tables ──────────────────────────────────────────────────────────────
//
// All colors below reference CSS custom properties defined in app/globals.css
// (under "Theme color tokens") rather than literal hex values, so a theme
// switch only needs to change that variable block — nothing here.

// Per-epic accent color palette (cycles through these)
// tint is a low-opacity fill derived from the same base var as the header/border.
export const EPIC_COLORS: Array<{
  tint: string;
  header: string;
  text: string;
  border: string;
}> = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
  tint: `color-mix(in srgb, var(--epic-${i}) var(--epic-tint-opacity), transparent)`,
  header: `var(--epic-${i})`,
  text: "var(--epic-text-on-accent)",
  border: `var(--epic-${i})`,
}));

// Unassigned group uses a neutral grey
export const UNASSIGNED_EPIC_COLOR = {
  tint: "color-mix(in srgb, var(--epic-unassigned) var(--epic-tint-opacity), transparent)",
  header: "var(--epic-unassigned)",
  text: "var(--epic-text-on-accent)",
  border: "var(--epic-unassigned)",
};

// Status → accent bar color (left border on white card nodes)
export const STATUS_COLORS: Record<string, string> = {
  new: "var(--status-todo)",
  indeterminate: "var(--status-progress)",
  done: "var(--status-done)",
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  new: "var(--status-todo-text)",
  indeterminate: "var(--status-progress-text)",
  done: "var(--status-done-text)",
};

// Edge link type name → color
export const EDGE_COLORS: Record<string, string> = {
  blocks: "var(--edge-blocks)",
  "is blocked by": "var(--edge-blocks)",
  subtask: "var(--edge-subtask)",
  parent: "var(--edge-subtask)",
  "relates to": "var(--edge-relates)",
  clones: "var(--edge-clones)",
  "is cloned by": "var(--edge-clones)",
  default: "var(--edge-default)",
};

// Issue type → pill color, shared between IssueNode and KanbanCard.
export const ISSUE_TYPE_LABEL: Record<string, { short: string; color: string; bg: string }> = {
  Story:   { short: "Story", color: "var(--type-story-color)", bg: "var(--type-story-bg)" },
  Bug:     { short: "Bug",   color: "var(--type-bug-color)",   bg: "var(--type-bug-bg)" },
  Task:    { short: "Task",  color: "var(--type-task-color)",  bg: "var(--type-task-bg)" },
  Subtask: { short: "Sub",   color: "var(--type-task-color)",  bg: "var(--type-task-bg)" },
  Epic:    { short: "Epic",  color: "var(--type-epic-color)",  bg: "var(--type-epic-bg)" },
};

export const ISSUE_TYPE_FALLBACK = { color: "var(--type-default-color)", bg: "var(--type-default-bg)" };

// ── Derived helpers ───────────────────────────────────────────────────────────

/** Compute total height of a task group given the number of subtasks */
export function groupHeight(subtaskCount: number): number {
  return (
    GROUP_PADDING_TOP +
    NODE_HEIGHT +
    (subtaskCount > 0
      ? GROUP_INNER_GAP + subtaskCount * SUBTASK_NODE_HEIGHT + (subtaskCount - 1) * GROUP_INNER_GAP
      : 0) +
    GROUP_PADDING_BOT
  );
}

/** Compute total width of a task group — depends only on module-level constants. */
export function groupWidth(): number {
  const widthForParent = NODE_WIDTH + 2 * GROUP_PADDING_X;
  const widthForSubtasks = GROUP_LEFT_INDENT + SUBTASK_NODE_WIDTH + GROUP_PADDING_X;
  return Math.max(widthForParent, widthForSubtasks);
}

/** Pre-computed group width — call groupWidth() once at module load. */
export const GROUP_WIDTH = groupWidth();

// ── Exported types ────────────────────────────────────────────────────────────

export type EdgeType = "blocks" | "subtask" | "relates-to" | "clone" | "default";

export interface IssueNodeData {
  key: string;
  summary: string;
  statusName: string;
  statusCategory: string;
  assignee: string | null;
  issueType: string;
  isSubtask: boolean;
  /** True when this node lives inside a taskGroupNode container.
   *  Handles are suppressed — the group container provides them instead. */
  insideGroup: boolean;
  /** True for Epic-type nodes that have no children in the loaded set
   *  (i.e. not acting as a group container parent). Renders with a wider
   *  amber-bordered card so they're visually distinct from task nodes. */
  isEpicStandalone: boolean;
  /** True when the issue has the "external" Jira label, indicating it
   *  depends on work from another team. Renders with an orange border and badge. */
  isExternal: boolean;
  /** True when at least one issue that blocks this one is not yet Done.
   *  Renders with a rose tint and a stop-flag badge in place of the status dot. */
  isBlocked: boolean;
  bgColor: string;
  textColor: string;
  subtaskCount?: number;
  /** Number of cross-epic outgoing dependency edges (e.g. "blocks" another epic's tasks).
   *  Shown as an ↗ badge on the node card. Populated by graphStructure Phase 4e. */
  crossEpicOut?: number;
  /** Number of cross-epic incoming dependency edges (e.g. "blocked by" another epic's tasks).
   *  Shown as an ↙ badge on the node card. Populated by graphStructure Phase 4e. */
  crossEpicIn?: number;
  /** Number of cross-story outgoing dependency edges (e.g. "blocks" tasks in another story).
   *  Shown as an ↗ badge on the node card. Populated by graphStructure Phase 4e′. */
  crossStoryOut?: number;
  /** Number of cross-story incoming dependency edges (e.g. "blocked by" tasks in another story).
   *  Shown as an ↙ badge on the node card. Populated by graphStructure Phase 4e′. */
  crossStoryIn?: number;
  [key: string]: unknown;
}

export interface TaskGroupNodeData {
  /** Key of the parent issue this group wraps */
  parentKey: string;
  /** Number of subtask children */
  subtaskCount: number;
  /** Y offsets (relative to group top) at which each subtask node starts */
  subtaskOffsets: number[];
  [key: string]: unknown;
}

export interface EpicGroupNodeData {
  /** Key of the epic issue (or UNASSIGNED_EPIC_KEY for orphan tasks) */
  epicKey: string;
  /** Display name / summary of the epic */
  epicSummary: string;
  /** Accent color bundle for this epic */
  color: { tint: string; header: string; text: string; border: string };
  [key: string]: unknown;
}

export interface StoryGroupNodeData {
  /** Key of the story issue */
  storyKey: string;
  /** Display name / summary of the story */
  storySummary: string;
  [key: string]: unknown;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

/** One resolved link within a cross-epic bundle — the raw issue keys and link type. */
export interface CrossEpicLink {
  sourceKey: string;
  targetKey: string;
  typeName: string;
  color: string;
}

/** Data stored on a `crossEpicBundle` edge. */
export interface CrossEpicBundleEdgeData {
  /** All individual cross-epic links aggregated into this bundle. */
  individualEdges: CrossEpicLink[];
  /** ELK-computed bend points (populated after layout, same format as ElkEdge). */
  bendPoints: Array<{ x: number; y: number }>;
  /** Dominant color (from the most common link type in the bundle). */
  color: string;
  /** Display label, e.g. "3 blocks" or "2 blocks, 1 relates to". */
  label: string;
  [key: string]: unknown;
}

/** One resolved link within a cross-story bundle — the raw issue keys and link type. */
export interface CrossStoryLink {
  sourceKey: string;
  targetKey: string;
  typeName: string;
  color: string;
}

/** Data stored on a `crossStoryBundle` edge. */
export interface CrossStoryBundleEdgeData {
  /** All individual cross-story links aggregated into this bundle. */
  individualEdges: CrossStoryLink[];
  /** ELK-computed bend points (populated after layout, same format as ElkEdge). */
  bendPoints: Array<{ x: number; y: number }>;
  /** Dominant color (from the most common link type in the bundle). */
  color: string;
  /** Display label, e.g. "2 blocks". */
  label: string;
  [key: string]: unknown;
}
