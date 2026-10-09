import type { Dependency, MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";

// ── Swimlane timeline layout ────────────────────────────────────────────────
//
// Remaining work laid out as lanes (one per team, or one per epic grouped by
// team) × columns (dependency level = earliest start). Positions are computed
// here, not by a layout engine: the x axis *is* the schedule, so a card's
// column must always equal its earliest start.

export type LaneMode = "team" | "epic";

export const CARD_WIDTH = 216;
export const CARD_HEIGHT = 76;
export const COLUMN_GAP = 56;
export const ROW_GAP = 10;
export const LANE_PADDING = 14;
export const LANE_HEADER_WIDTH = 188;

export interface LaidOutCard {
  item: WorkItem;
  x: number;
  y: number;
}

export interface Lane {
  id: string;
  title: string;
  subtitle: string;
  team: string;
  y: number;
  height: number;
  remaining: number;
  critical: number;
}

export interface LaidOutEdge {
  dependency: Dependency;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TimelineLayout {
  lanes: Lane[];
  cards: LaidOutCard[];
  edges: LaidOutEdge[];
  columns: number;
  width: number;
  height: number;
}

export function columnX(level: number): number {
  return LANE_HEADER_WIDTH + COLUMN_GAP / 2 + level * (CARD_WIDTH + COLUMN_GAP);
}

export interface LayoutOptions {
  /** Keep only lanes whose remaining items pass — e.g. lanes with a filter match. Columns are unaffected. */
  includeLane?: (members: WorkItem[]) => boolean;
}

export function layoutTimeline(detail: MilestoneDetail, mode: LaneMode, options: LayoutOptions = {}): TimelineLayout {
  const scheduled = detail.items.filter((i) => i.schedule);
  const epicByKey = new Map(detail.epics.map((e) => [e.key, e]));

  const laneOf = (item: WorkItem) =>
    mode === "team" ? item.team : item.external ? `external:${item.team}` : (item.epicKey ?? item.key);

  const groups = new Map<string, WorkItem[]>();
  for (const item of scheduled) {
    const id = laneOf(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }

  // Lanes holding critical work first, then by team, then by how early the
  // lane's work starts — the eye should land on what matters most.
  const laneIds = [...groups.keys()].sort((a, b) => {
    const ga = groups.get(a) ?? [];
    const gb = groups.get(b) ?? [];
    const ca = ga.some((i) => i.schedule?.critical);
    const cb = gb.some((i) => i.schedule?.critical);
    if (ca !== cb) return ca ? -1 : 1;
    const ta = ga[0]?.team ?? "";
    const tb = gb[0]?.team ?? "";
    if (mode === "epic" && ta !== tb) return ta.localeCompare(tb);
    const sa = Math.min(...ga.map((i) => i.schedule?.earliestStart ?? 0));
    const sb = Math.min(...gb.map((i) => i.schedule?.earliestStart ?? 0));
    return sa - sb || a.localeCompare(b);
  });

  const columns = Math.max(detail.criticalPath.length, 1);
  const lanes: Lane[] = [];
  const cards: LaidOutCard[] = [];
  const position = new Map<string, { x: number; y: number }>();
  let y = 0;

  for (const id of laneIds) {
    const members = groups.get(id) ?? [];
    if (options.includeLane && !options.includeLane(members)) continue;
    const byLevel = new Map<number, WorkItem[]>();
    for (const item of members) {
      const level = item.schedule?.earliestStart ?? 0;
      byLevel.set(level, [...(byLevel.get(level) ?? []), item]);
    }
    let rows = 1;
    for (const [level, list] of byLevel) {
      list.sort(
        (a, b) =>
          Number(b.schedule?.critical) - Number(a.schedule?.critical) ||
          (b.schedule?.downstream ?? 0) - (a.schedule?.downstream ?? 0) ||
          a.key.localeCompare(b.key),
      );
      rows = Math.max(rows, list.length);
      list.forEach((item, row) => {
        const pos = { x: columnX(level), y: y + LANE_PADDING + row * (CARD_HEIGHT + ROW_GAP) };
        position.set(item.key, pos);
        cards.push({ item, ...pos });
      });
    }
    const height = LANE_PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * ROW_GAP;
    const sample = members[0];
    const epic = mode === "epic" && sample?.epicKey ? epicByKey.get(sample.epicKey) : undefined;
    lanes.push({
      id,
      title: mode === "team" ? id : (epic?.summary ?? (sample?.external ? `Outside milestone` : sample?.summary ?? id)),
      subtitle: mode === "team" ? `${members.length} remaining` : epic ? `${epic.key} · ${epic.team}` : (sample?.team ?? ""),
      team: sample?.team ?? "",
      y,
      height,
      remaining: members.length,
      critical: members.filter((i) => i.schedule?.critical).length,
    });
    y += height;
  }

  const edges: LaidOutEdge[] = [];
  for (const dep of detail.dependencies) {
    const a = position.get(dep.from);
    const b = position.get(dep.to);
    if (!a || !b) continue;
    edges.push({
      dependency: dep,
      x1: a.x + CARD_WIDTH,
      y1: a.y + CARD_HEIGHT / 2,
      x2: b.x,
      y2: b.y + CARD_HEIGHT / 2,
    });
  }

  return {
    lanes,
    cards,
    edges,
    columns,
    width: columnX(columns) - COLUMN_GAP / 2 + 24,
    height: y,
  };
}

/** Every item upstream and downstream of `key` — the chain to light up on hover. */
export function chainOf(key: string, dependencies: Dependency[]): Set<string> {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const d of dependencies) {
    if (d.satisfied) continue;
    down.set(d.from, [...(down.get(d.from) ?? []), d.to]);
    up.set(d.to, [...(up.get(d.to) ?? []), d.from]);
  }
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
  return seen;
}
