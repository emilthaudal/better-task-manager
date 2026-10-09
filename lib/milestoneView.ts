import type { LaidOutCard, LaneMode, LaidOutEdge } from "@/lib/milestoneLayout";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/milestoneLayout";
import type { Dependency, MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";

// ── Pure view logic for the milestone page ──────────────────────────────────
//
// URL state, filtering, keyboard navigation and viewport culling — kept out
// of the components so they can be tested and so renders stay cheap.

// ── URL state ───────────────────────────────────────────────────────────────

export type MilestoneTab = "path" | "insights";

export interface MilestoneViewState {
  tab: MilestoneTab;
  lanes: LaneMode;
  /** Selected issue key (item, epic or increment). */
  item: string | null;
  query: string;
}

export const DEFAULT_VIEW: MilestoneViewState = { tab: "path", lanes: "epic", item: null, query: "" };

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

export function parseViewState(params: URLSearchParams): MilestoneViewState {
  const tab = params.get("tab");
  const lanes = params.get("lanes");
  const item = params.get("item")?.toUpperCase() ?? null;
  return {
    tab: tab === "insights" ? "insights" : "path",
    lanes: lanes === "team" ? "team" : "epic",
    item: item && ISSUE_KEY.test(item) ? item : null,
    query: (params.get("q") ?? "").slice(0, 100),
  };
}

/**
 * Writes the view state into `params`, leaving unrelated params (e.g.
 * `fixture`) alone and omitting defaults so shared links stay short.
 */
export function serializeViewState(state: MilestoneViewState, params = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(params);
  const put = (key: string, value: string, fallback: string) => (value && value !== fallback ? next.set(key, value) : next.delete(key));
  put("tab", state.tab, DEFAULT_VIEW.tab);
  put("lanes", state.lanes, DEFAULT_VIEW.lanes);
  put("item", state.item ?? "", "");
  put("q", state.query.trim(), "");
  return next;
}

// ── Filtering ───────────────────────────────────────────────────────────────

/** Quick filters, written into the query as `is:<name>` so they share links like text. */
export const QUICK_FILTERS = {
  critical: { label: "Critical", test: (i: WorkItem) => !!i.schedule?.critical },
  ready: { label: "Ready", test: (i: WorkItem) => !!i.schedule?.ready },
  unassigned: { label: "Unassigned", test: (i: WorkItem) => !!i.schedule && !i.assignee },
  cross: { label: "Blocks other teams", test: (i: WorkItem) => (i.schedule?.downstreamTeams.length ?? 0) > 0 },
  outside: { label: "Outside", test: (i: WorkItem) => i.external },
} as const;

export type QuickFilter = keyof typeof QUICK_FILTERS;

const isQuickFilter = (name: string): name is QuickFilter => Object.hasOwn(QUICK_FILTERS, name);

/** Whether `is:<name>` is part of the query. */
export function hasQuickFilter(query: string, name: QuickFilter): boolean {
  return query.toLowerCase().split(/\s+/).includes(`is:${name}`);
}

/** Adds or removes `is:<name>`, leaving the free text alone. */
export function toggleQuickFilter(query: string, name: QuickFilter): string {
  const token = `is:${name}`;
  const terms = query.split(/\s+/).filter(Boolean);
  const next = hasQuickFilter(query, name) ? terms.filter((t) => t.toLowerCase() !== token) : [...terms, token];
  return next.join(" ");
}

/**
 * Items matching a query: free text over key, summary, assignee, team and
 * epic, plus `is:` quick filters. Every term must match. `null` = no filter.
 */
export function matchItems(detail: MilestoneDetail, query: string): Set<string> | null {
  const all = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (all.length === 0) return null;
  const predicates = all.filter((t) => t.startsWith("is:") && isQuickFilter(t.slice(3))).map((t) => QUICK_FILTERS[t.slice(3) as QuickFilter].test);
  const terms = all.filter((t) => !(t.startsWith("is:") && isQuickFilter(t.slice(3))));
  const epicSummary = new Map(detail.epics.map((e) => [e.key, e.summary]));
  const out = new Set<string>();
  for (const item of detail.items) {
    if (!predicates.every((p) => p(item))) continue;
    const haystack = [
      item.key,
      item.summary,
      item.assignee ?? "unassigned",
      item.team,
      item.epicKey ?? "",
      item.epicKey ? (epicSummary.get(item.epicKey) ?? "") : "",
    ]
      .join(" ")
      .toLowerCase();
    if (terms.every((t) => haystack.includes(t))) out.add(item.key);
  }
  return out;
}

// ── Dependency chains ───────────────────────────────────────────────────────

/** Adjacency over unsatisfied links, built once per payload. */
export function chainIndex(dependencies: Dependency[]): (key: string) => Set<string> {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const d of dependencies) {
    if (d.satisfied) continue;
    (down.get(d.from) ?? down.set(d.from, []).get(d.from))?.push(d.to);
    (up.get(d.to) ?? up.set(d.to, []).get(d.to))?.push(d.from);
  }
  const memo = new Map<string, Set<string>>();
  return (key) => {
    const hit = memo.get(key);
    if (hit) return hit;
    const seen = new Set<string>([key]);
    for (const graph of [up, down]) {
      const stack = [key];
      while (stack.length) {
        const k = stack.pop() as string;
        for (const next of graph.get(k) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    memo.set(key, seen);
    return seen;
  };
}

// ── Keyboard navigation ─────────────────────────────────────────────────────

export type Direction = "left" | "right" | "up" | "down";

/**
 * The card to move to from `fromKey`. Left/right step to the nearest column
 * that has cards, preferring the vertically closest one; up/down move to the
 * nearest card above/below in the same column.
 */
export function neighbor(cards: LaidOutCard[], fromKey: string | null, dir: Direction): string | null {
  if (cards.length === 0) return null;
  const from = fromKey ? cards.find((c) => c.item.key === fromKey) : undefined;
  if (!from) {
    // Nothing selected yet: start at the top-left card.
    const first = [...cards].sort((a, b) => a.x - b.x || a.y - b.y)[0];
    return first?.item.key ?? null;
  }
  let best: LaidOutCard | null = null;
  let bestScore = Infinity;
  for (const c of cards) {
    if (c === from) continue;
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    let score: number;
    if (dir === "right" || dir === "left") {
      if (dir === "right" ? dx <= 0 : dx >= 0) continue;
      // Nearest column first, then nearest row within it.
      score = Math.abs(dx) * 1000 + Math.abs(dy);
    } else {
      if (dx !== 0 || (dir === "down" ? dy <= 0 : dy >= 0)) continue;
      score = Math.abs(dy);
    }
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best?.item.key ?? null;
}

// ── Viewport culling ────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The visible region in layout coordinates, padded by `overscan` and snapped
 * outward to a `tile` grid — scrolling within a tile yields the identical
 * rect, so the timeline only re-renders when new tiles come into view.
 */
export function cullWindow(
  scroll: { left: number; top: number; width: number; height: number },
  zoom: number,
  overscan = 400,
  tile = 512,
): Rect {
  const x0 = Math.max(0, scroll.left / zoom - overscan);
  const y0 = Math.max(0, scroll.top / zoom - overscan);
  const x1 = (scroll.left + scroll.width) / zoom + overscan;
  const y1 = (scroll.top + scroll.height) / zoom + overscan;
  const sx = Math.floor(x0 / tile) * tile;
  const sy = Math.floor(y0 / tile) * tile;
  return { x: sx, y: sy, width: Math.ceil(x1 / tile) * tile - sx, height: Math.ceil(y1 / tile) * tile - sy };
}

const intersects = (r: Rect, x: number, y: number, w: number, h: number) =>
  x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y;

export function visibleCards(cards: LaidOutCard[], rect: Rect | null): LaidOutCard[] {
  if (!rect) return cards;
  return cards.filter((c) => intersects(rect, c.x, c.y, CARD_WIDTH, CARD_HEIGHT));
}

/** Edges whose bounding box touches the window — an edge can cross it with both ends outside. */
export function visibleEdges(edges: LaidOutEdge[], rect: Rect | null): LaidOutEdge[] {
  if (!rect) return edges;
  return edges.filter((e) => {
    const x = Math.min(e.x1, e.x2);
    const y = Math.min(e.y1, e.y2);
    return intersects(rect, x, y, Math.abs(e.x2 - e.x1) + 1, Math.abs(e.y2 - e.y1) + 1);
  });
}

// ── Cross-team dependency matrix ────────────────────────────────────────────

export interface TeamMatrix {
  /** Teams in display order: most blocking first. */
  teams: string[];
  /** counts[blocker][blocked] = open cross-team links from blocker's work to blocked's. */
  counts: Record<string, Record<string, number>>;
  max: number;
}

/**
 * Open (unsatisfied) cross-team "blocks" links, aggregated team × team —
 * who is waiting on whom. Null when there are none.
 */
export function teamMatrix(detail: MilestoneDetail): TeamMatrix | null {
  const teamOf = new Map(detail.items.map((i) => [i.key, i.team]));
  for (const e of detail.epics) teamOf.set(e.key, e.team);
  const counts: Record<string, Record<string, number>> = {};
  const outgoing = new Map<string, number>();
  const involved = new Set<string>();
  let max = 0;
  for (const d of detail.dependencies) {
    if (d.satisfied || !d.crossTeam) continue;
    const from = teamOf.get(d.from);
    const to = teamOf.get(d.to);
    if (!from || !to || from === to) continue;
    const row = (counts[from] ??= {});
    row[to] = (row[to] ?? 0) + 1;
    max = Math.max(max, row[to]);
    outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
    involved.add(from).add(to);
  }
  if (involved.size === 0) return null;
  const teams = [...involved].sort((a, b) => (outgoing.get(b) ?? 0) - (outgoing.get(a) ?? 0) || a.localeCompare(b));
  return { teams, counts, max };
}

// ── Payload equality ────────────────────────────────────────────────────────

/** Same content ignoring `generatedAt` — a poll that changed nothing shouldn't re-render. */
export function samePayload(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) =>
    JSON.stringify(v, (key, value: unknown) => (key === "generatedAt" ? undefined : value));
  return strip(a) === strip(b);
}

export function itemByKey(detail: MilestoneDetail): Map<string, WorkItem> {
  return new Map(detail.items.map((i) => [i.key, i]));
}
