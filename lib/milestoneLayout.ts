import type { Dependency, MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";

// ── Swimlane timeline layout ────────────────────────────────────────────────
//
// Remaining work laid out as lanes (one per team, or one per epic grouped by
// team) × columns (dependency level = earliest start). Positions are computed
// here, not by a layout engine: the x axis *is* the schedule, so a card's
// column must always equal its earliest start. Mirrors SwimlaneLayout.swift in
// the mac app so both clients draw the same picture.

export type LaneMode = "team" | "epic";

export const CARD_WIDTH = 216;
export const CARD_HEIGHT = 84;
export const COLUMN_GAP = 56;
export const ROW_GAP = 10;
export const LANE_PADDING = 14;
export const LANE_GAP = 8;
export const LANE_HEADER_WIDTH = 188;
/** Cards shown per lane/column cell before the rest fold behind a "more" pill. A
 * large milestone has dozens of unblocked items per team in "Now", which would
 * otherwise make each lane thousands of pixels tall. */
export const CELL_LIMIT = 8;
export const OVERFLOW_HEIGHT = CARD_HEIGHT / 2;

export interface LaidOutCard {
  item: WorkItem;
  x: number;
  y: number;
  /** Column index, counting the leading "Done" column when it is shown. */
  column?: number;
  /** Right edge of the latest column the card can start in without delaying the
   * milestone; null when it has no slack. */
  slackX2?: number | null;
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
  /** Every card in the lane is outside the milestone. */
  external?: boolean;
  /** Some cell holds more cards than CELL_LIMIT. */
  collapsible?: boolean;
  expanded?: boolean;
}

/** Stands in for the cards folded away in one lane/column cell. */
export interface Overflow {
  laneId: string;
  column: number;
  hidden: number;
  x: number;
  y: number;
}

export interface LaidOutEdge {
  dependency: Dependency;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ColumnStat {
  /** null for the leading "Done" column. */
  level: number | null;
  /** Cards in the column, folded ones included. */
  total: number;
  critical: number;
}

export interface TimelineLayout {
  lanes: Lane[];
  cards: LaidOutCard[];
  edges: LaidOutEdge[];
  columns: number;
  width: number;
  height: number;
  overflows?: Overflow[];
  columnStats?: ColumnStat[];
  /** Folded-away card → its lane, so selecting one can unfold the lane first. */
  hiddenLane?: Map<string, string>;
  doneColumn?: boolean;
}

export function columnX(column: number): number {
  return LANE_HEADER_WIDTH + COLUMN_GAP / 2 + column * (CARD_WIDTH + COLUMN_GAP);
}

export interface LayoutOptions {
  /** Done items in a leading "Done" column. */
  showDone?: boolean;
  /** Items outside the milestone (blockers or dependants pulled in by a link). */
  showOutside?: boolean;
  /** Keep only lanes whose items pass — e.g. lanes with a filter match. Columns are unaffected. */
  includeLane?: (members: WorkItem[]) => boolean;
  /** Lanes the user unfolded. */
  expandedLanes?: ReadonlySet<string>;
  /** Never folded away: the selection must keep a card to navigate from and highlight. */
  pinnedKey?: string | null;
  /** Ranked ahead of everything else when a cell folds — e.g. filter matches,
   * which would otherwise be hidden in the lanes kept to show them. */
  prefer?: ReadonlySet<string> | null;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

interface Placement {
  item: WorkItem;
  lane: string;
  column: number;
}

interface LaneSeed {
  id: string;
  title: string;
  subtitle: string;
  team: string;
  external: boolean;
  remaining: number;
  done: number;
  critical: number;
  firstCriticalLevel: number;
  firstLevel: number;
  members: WorkItem[];
}

export function layoutTimeline(detail: MilestoneDetail, mode: LaneMode, options: LayoutOptions = {}): TimelineLayout {
  const { showDone = false, showOutside = true, expandedLanes, pinnedKey, prefer } = options;
  const visible = detail.items.filter((i) => (showOutside || !i.external) && (i.schedule || showDone));

  // Done items have no schedule; they get their own leading column so the
  // remaining work keeps reading left → right from "now".
  const doneColumn = showDone && visible.some((i) => !i.schedule);
  const shift = doneColumn ? 1 : 0;
  // Slack bars run to the latest start, which can lie past the critical path's
  // end when a chain shortened after the item was scheduled.
  let maxLevel = -1;
  for (const i of visible) {
    if (i.schedule) maxLevel = Math.max(maxLevel, i.schedule.earliestStart, i.schedule.latestStart);
  }
  const columns = Math.max(detail.criticalPath.length, maxLevel + 1, 1) + shift;

  const laneOf = (item: WorkItem) =>
    mode === "team"
      ? item.team
      : item.external
        ? `external:${item.team}`
        : item.epicKey
          ? item.epicKey
          : `noepic:${item.team}`;

  const placements: Placement[] = visible.map((item) => ({
    item,
    lane: laneOf(item),
    column: item.schedule ? item.schedule.earliestStart + shift : 0,
  }));

  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const list = groups.get(p.lane);
    if (list) list.push(p);
    else groups.set(p.lane, [p]);
  }

  const seeds = orderedLanes(groups, mode, detail).filter((s) => !options.includeLane || options.includeLane(s.members));
  const kept = new Set(seeds.map((s) => s.id));

  // Lane heights depend only on how many cards share a (lane, column) cell.
  const cells = new Map<string, Map<number, Placement[]>>();
  for (const p of placements) {
    if (!kept.has(p.lane)) continue;
    let byColumn = cells.get(p.lane);
    if (!byColumn) cells.set(p.lane, (byColumn = new Map()));
    const list = byColumn.get(p.column);
    if (list) list.push(p);
    else byColumn.set(p.column, [p]);
  }
  const collapsible = new Set<string>();
  for (const [lane, byColumn] of cells) {
    for (const list of byColumn.values()) if (list.length > CELL_LIMIT) collapsible.add(lane);
  }
  const folded = (lane: string) => collapsible.has(lane) && !expandedLanes?.has(lane);

  // A folded cell keeps its most important cards: critical first, then the ones
  // that unblock the most. Everything else waits behind the "more" pill.
  const hidden = new Set<string>();
  for (const [lane, byColumn] of cells) {
    if (!folded(lane)) continue;
    for (const list of byColumn.values()) {
      if (list.length <= CELL_LIMIT) continue;
      const ranked = [...list].sort((a, b) => {
        const pa = !!prefer?.has(a.item.key);
        const pb = !!prefer?.has(b.item.key);
        if (pa !== pb) return pa ? -1 : 1;
        const ca = !!a.item.schedule?.critical;
        const cb = !!b.item.schedule?.critical;
        if (ca !== cb) return ca ? -1 : 1;
        const da = a.item.schedule?.downstream ?? 0;
        const db = b.item.schedule?.downstream ?? 0;
        if (da !== db) return db - da;
        const la = a.item.blocks.length + a.item.blockedBy.length > 0;
        const lb = b.item.blocks.length + b.item.blockedBy.length > 0;
        if (la !== lb) return la ? -1 : 1;
        return naturalCompare(a.item.key, b.item.key);
      });
      const at = pinnedKey ? ranked.findIndex((p) => p.item.key === pinnedKey) : -1;
      if (at >= CELL_LIMIT) ranked.splice(CELL_LIMIT - 1, 0, ...ranked.splice(at, 1));
      for (const p of ranked.slice(CELL_LIMIT)) hidden.add(p.item.key);
    }
  }

  const lanes: Lane[] = [];
  const laneY = new Map<string, number>();
  let y = 0;
  for (const seed of seeds) {
    let tallest = 1;
    for (const list of cells.get(seed.id)?.values() ?? []) tallest = Math.max(tallest, list.length);
    // A folded lane shows CELL_LIMIT cards plus a half-height row for the pill.
    const isFolded = folded(seed.id) && tallest > CELL_LIMIT;
    const rows = isFolded ? CELL_LIMIT : tallest;
    const height =
      LANE_PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * ROW_GAP + (isFolded ? ROW_GAP + OVERFLOW_HEIGHT : 0);
    laneY.set(seed.id, y);
    lanes.push({
      id: seed.id,
      title: seed.title,
      subtitle: seed.subtitle,
      team: seed.team,
      y,
      height,
      remaining: seed.remaining,
      critical: seed.critical,
      external: seed.external,
      collapsible: collapsible.has(seed.id),
      expanded: collapsible.has(seed.id) && !!expandedLanes?.has(seed.id),
    });
    y += height + LANE_GAP;
  }

  // Columns are placed left to right so each card can sit near the cards that
  // block it (barycentre of their rows) — that keeps edges short and level.
  const centreY = new Map<string, number>();
  const barycentre = (item: WorkItem) => {
    let sum = 0;
    let n = 0;
    for (const k of item.blockedBy) {
      const c = centreY.get(k);
      if (c !== undefined) {
        sum += c;
        n++;
      }
    }
    return n ? sum / n : null;
  };

  const cards: LaidOutCard[] = [];
  const overflows: Overflow[] = [];
  const position = new Map<string, LaidOutCard>();
  for (let column = 0; column < columns; column++) {
    for (const [lane, byColumn] of cells) {
      const all = byColumn.get(column);
      const top = laneY.get(lane);
      if (!all || top === undefined) continue;
      const shown = all.filter((p) => !hidden.has(p.item.key));
      const bary = new Map(shown.map((p) => [p.item.key, barycentre(p.item)]));
      shown.sort((a, b) => {
        const ca = !!a.item.schedule?.critical;
        const cb = !!b.item.schedule?.critical;
        if (ca !== cb) return ca ? -1 : 1;
        const ba = bary.get(a.item.key) ?? null;
        const bb = bary.get(b.item.key) ?? null;
        if (ba !== null && bb !== null && ba !== bb) return ba - bb;
        if ((ba === null) !== (bb === null)) return ba !== null ? -1 : 1;
        const da = a.item.schedule?.downstream ?? 0;
        const db = b.item.schedule?.downstream ?? 0;
        if (da !== db) return db - da;
        return naturalCompare(a.item.key, b.item.key);
      });
      shown.forEach((p, row) => {
        const s = p.item.schedule;
        const card: LaidOutCard = {
          item: p.item,
          x: columnX(column),
          y: top + LANE_PADDING + row * (CARD_HEIGHT + ROW_GAP),
          column,
          slackX2: s && s.slack > 0 ? columnX(s.latestStart + shift) + CARD_WIDTH : null,
        };
        centreY.set(p.item.key, card.y + CARD_HEIGHT / 2);
        position.set(p.item.key, card);
        cards.push(card);
      });
      if (shown.length < all.length) {
        overflows.push({
          laneId: lane,
          column,
          hidden: all.length - shown.length,
          x: columnX(column),
          y: top + LANE_PADDING + shown.length * (CARD_HEIGHT + ROW_GAP),
        });
      }
    }
  }

  const edges: LaidOutEdge[] = [];
  for (const dep of detail.dependencies) {
    const a = position.get(dep.from);
    const b = position.get(dep.to);
    // Same-column links only happen through cycles or done work; drawn, they
    // would loop back over the card.
    if (!a || !b || (b.column ?? 0) <= (a.column ?? 0)) continue;
    edges.push({
      dependency: dep,
      x1: a.x + CARD_WIDTH,
      y1: a.y + CARD_HEIGHT / 2,
      x2: b.x,
      y2: b.y + CARD_HEIGHT / 2,
    });
  }

  const columnStats: ColumnStat[] = Array.from({ length: columns }, (_, c) => ({
    level: doneColumn && c === 0 ? null : c - shift,
    total: 0,
    critical: 0,
  }));
  const hiddenLane = new Map<string, string>();
  for (const p of placements) {
    if (!kept.has(p.lane)) continue;
    const stat = columnStats[p.column];
    if (stat) {
      stat.total++;
      if (p.item.schedule?.critical) stat.critical++;
    }
    if (hidden.has(p.item.key)) hiddenLane.set(p.item.key, p.lane);
  }

  return {
    lanes,
    cards,
    edges,
    columns,
    width: columnX(columns) - COLUMN_GAP / 2 + 24,
    height: Math.max(0, y - LANE_GAP),
    overflows,
    columnStats,
    hiddenLane,
    doneColumn,
  };
}

/**
 * Lanes carrying the critical path come first, in the order the path reaches
 * them, so the path reads top-down as well as left to right; work outside the
 * milestone sinks to the bottom.
 */
function orderedLanes(groups: Map<string, Placement[]>, mode: LaneMode, detail: MilestoneDetail): LaneSeed[] {
  const epicByKey = new Map(detail.epics.map((e) => [e.key, e]));
  const seeds: LaneSeed[] = [];
  for (const [id, placements] of groups) {
    const members = placements.map((p) => p.item);
    const sample = members[0] as WorkItem;
    const remaining = members.filter((i) => i.schedule);
    const criticalLevels = remaining.filter((i) => i.schedule?.critical).map((i) => i.schedule?.earliestStart ?? 0);
    const done = members.length - remaining.length;
    const external = members.every((i) => i.external);
    const epic = mode === "epic" && !external && sample.epicKey ? epicByKey.get(sample.epicKey) : undefined;
    const counts = `${remaining.length} remaining${done ? ` · ${done} done` : ""}`;
    let title: string;
    let subtitle: string;
    if (mode === "team") {
      title = sample.team;
      subtitle = counts;
    } else if (external) {
      title = sample.team;
      subtitle = counts;
    } else if (sample.epicKey) {
      title = epic?.summary ?? sample.epicKey;
      subtitle = `${sample.epicKey} · ${sample.team}`;
    } else {
      title = "No epic";
      subtitle = sample.team;
    }
    seeds.push({
      id,
      title,
      subtitle,
      team: sample.team,
      external,
      remaining: remaining.length,
      done,
      critical: criticalLevels.length,
      firstCriticalLevel: criticalLevels.length ? Math.min(...criticalLevels) : Infinity,
      firstLevel: remaining.length ? Math.min(...remaining.map((i) => i.schedule?.earliestStart ?? 0)) : Infinity,
      members,
    });
  }
  return seeds.sort((a, b) => {
    if (a.external !== b.external) return a.external ? 1 : -1;
    if (a.firstCriticalLevel !== b.firstCriticalLevel) return a.firstCriticalLevel - b.firstCriticalLevel;
    if (mode === "epic" && a.team !== b.team) return naturalCompare(a.team, b.team);
    if (a.firstLevel !== b.firstLevel) return a.firstLevel - b.firstLevel;
    return naturalCompare(a.title, b.title) || naturalCompare(a.id, b.id);
  });
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
