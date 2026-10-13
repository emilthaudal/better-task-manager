"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CELL_LIMIT,
  COLUMN_GAP,
  LANE_HEADER_WIDTH,
  OVERFLOW_HEIGHT,
  ROW_GAP,
  columnX,
  layoutTimeline,
} from "@/lib/milestoneLayout";
import type { LaidOutCard, LaidOutEdge, Lane, LaneMode, Overflow } from "@/lib/milestoneLayout";
import { chainHasEdge, chainIndex, cullWindow, neighbor, visibleCards, visibleEdges } from "@/lib/milestoneView";
import type { Direction, Rect } from "@/lib/milestoneView";
import type { MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";
import { teamColors } from "@/lib/teamColor";
import { Avatar, StatusDot } from "./MilestoneBits";

interface Props {
  detail: MilestoneDetail;
  laneMode: LaneMode;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Keys matching the filter, or null when no filter is active. */
  matches: Set<string> | null;
  /** Done items in a leading "Done" column. */
  showDone?: boolean;
  /** Items outside the milestone pulled in by a link. */
  showOutside?: boolean;
  /** Lane header click in team mode. */
  onOpenTeam?: (team: string) => void;
  /** Return or double-click: open the inspector for a card. */
  onInspect?: (key: string) => void;
}

const HEADER_H = 40;
const LANE_W = LANE_HEADER_WIDTH;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.8;
const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.8];
const HOVER_CLEAR_MS = 90;
/** Width of the floating inspector plus its margin. */
const INSPECTOR_W = 396;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const EMPTY_SET: ReadonlySet<string> = new Set();

function edgePath(e: LaidOutEdge): string {
  const dx = Math.max(28, (e.x2 - e.x1) / 2);
  return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2 - 2} ${e.y2}`;
}

const steps = (n: number) => `${n} step${n === 1 ? "" : "s"}`;

function columnTitle(level: number | null): string {
  if (level === null) return "Done";
  return level === 0 ? "Now" : `Step ${level + 1}`;
}

function columnHelp(level: number | null): string {
  if (level === null) return "Already done";
  if (level === 0) return "Work with no remaining blockers — can start now";
  return `Can start once ${steps(level)} of blocking work is done`;
}

/** Later in the list draws on top: the critical path must never sink under a same-team link. */
function edgeRank(e: LaidOutEdge): number {
  const d = e.dependency;
  if (d.satisfied) return 0;
  if (d.critical) return 3;
  if (d.crossTeam) return 2;
  return 1;
}

/** Tooltip lines for a card: summary, owner, and what its timing means. */
function tooltipLines(item: WorkItem): { title: string; meta: string; schedule: string } {
  const s = item.schedule;
  let schedule = "";
  if (s) {
    schedule = s.critical ? "On the critical path — any delay moves the milestone" : `Can slip ${s.slack} step${s.slack === 1 ? "" : "s"} without delaying the milestone`;
    if (s.downstream > 0) schedule += ` · unblocks ${s.downstream}${s.downstreamTeams.length ? ` in ${s.downstreamTeams.join(", ")}` : ""}`;
  } else if (item.status.category === "done") {
    schedule = "Done";
  }
  if (item.placeholder) schedule = `Team epic not broken down into items yet${schedule ? ` · ${schedule}` : ""}`;
  return {
    title: item.summary,
    meta: `${item.key} · ${item.team} · ${item.assignee ?? "Unassigned"}${item.external ? " · outside this milestone" : ""}`,
    schedule,
  };
}

const TOOLTIP_DELAY_MS = 450;

// ── Card ────────────────────────────────────────────────────────────────────

const Card = memo(function Card({
  item,
  x,
  y,
  selected,
  focusable,
  match,
}: {
  item: WorkItem;
  x: number;
  y: number;
  selected: boolean;
  focusable: boolean;
  match: boolean;
}) {
  const s = item.schedule;
  const critical = !!s?.critical;
  const ready = !!s?.ready;
  const done = item.status.category === "done";
  const crossTeams = s?.downstreamTeams.length ?? 0;
  return (
    <button
      type="button"
      data-k={item.key}
      data-selected={selected ? "" : undefined}
      data-match={match ? "" : undefined}
      data-critical={critical ? "" : undefined}
      data-done={done ? "" : undefined}
      tabIndex={focusable ? 0 : -1}
      aria-pressed={selected}
      aria-label={`${item.key}: ${item.summary}${done ? ", done" : ""}${critical ? ", critical" : ""}${ready ? ", ready" : ""}${item.placeholder ? ", not broken down" : ""}${item.external ? ", outside this milestone" : ""}${item.assignee ? `, ${item.assignee}` : ", unassigned"}`}
      className={cn(
        "ms-card absolute flex flex-col justify-between overflow-hidden rounded-xl bg-[var(--ms-surface)] py-2 pl-3 pr-2.5 text-left",
        item.external && "bg-[var(--ms-warn-fill)] outline-1 outline-dashed -outline-offset-1 outline-[var(--ms-warn)]",
      )}
      style={{ left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      {/* Ready wins the edge: "start this now" is the more actionable signal, and critical keeps its red ring. */}
      {(ready || critical) && (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 w-[3px]", ready ? "bg-[var(--ms-ready)]" : "bg-[var(--ms-critical)]")}
        />
      )}
      {/* Zoomed out, the detail rows would render at ~6 px; a large summary stays legible. */}
      <div aria-hidden="true" className="ms-card-compact line-clamp-2 text-[25px] font-semibold leading-[1.12] tracking-[-0.02em] text-[var(--ms-label)]">
        {item.summary}
      </div>
      <div className="ms-card-detail flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        <StatusDot status={item.status} />
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] font-medium",
            critical ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]",
          )}
        >
          {item.key}
        </span>
        {item.external && <span className="truncate text-[10px] font-semibold text-[var(--ms-warn-text)]">Outside</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {crossTeams > 0 && (
            <span className="rounded-full bg-[var(--ms-cross-fill)] px-1.5 py-[1px] text-[10px] font-semibold tabular-nums text-[var(--ms-cross-text)]">
              ⇄ {crossTeams}
            </span>
          )}
          {s?.ready && (
            <span className="rounded-full bg-[var(--ms-ready-fill)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--ms-ready-text)]">
              Ready
            </span>
          )}
          {!critical && !item.external && s && s.slack > 0 && (
            <span className="text-[10px] font-medium tabular-nums text-[var(--ms-label-3)]">+{s.slack}</span>
          )}
        </span>
      </div>
      <div className="ms-card-detail line-clamp-2 text-[12.5px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--ms-label)]">{item.summary}</div>
      <div className="ms-card-detail flex items-center gap-1.5 text-[11px] text-[var(--ms-label-3)]">
        {item.placeholder ? (
          <span className="min-w-0 flex-1">
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--ms-warn-fill)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--ms-warn-text)]">
              <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-[2px] border border-dashed border-current" />
              Not broken down
            </span>
          </span>
        ) : (
          <>
            <Avatar name={item.assignee} size={14} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                !item.assignee && critical && "font-semibold text-[var(--ms-warn-text)]",
              )}
            >
              {item.assignee ?? "Unassigned"}
            </span>
          </>
        )}
        {s && s.downstream > 0 && <span className="shrink-0 tabular-nums">→ {s.downstream}</span>}
      </div>
    </button>
  );
});

// ── Static layers (memoised: they only change with layout / culling) ───────

type LaneView = Lane & { newTeam: boolean; color: string };

const LaneBands = memo(function LaneBands({ lanes, width }: { lanes: LaneView[]; width: number }) {
  // Starts at the lane header's edge: the header carries the same tint and
  // rounded left corners, so header + band read as one lane.
  return (
    <>
      {lanes.map((lane) => (
        <div
          key={lane.id}
          aria-hidden="true"
          data-external={lane.external ? "" : undefined}
          className="ms-lane-band absolute"
          style={{ top: lane.y, height: lane.height, left: LANE_W, width: width - LANE_W - 8, "--tint": lane.color } as React.CSSProperties}
        />
      ))}
    </>
  );
});

type EdgeKind = "crit" | "cross" | "norm" | "done";

const EDGE_COLOR: Record<EdgeKind, string> = {
  crit: "var(--ms-critical)",
  cross: "var(--ms-cross)",
  norm: "var(--ms-edge)",
  done: "var(--ms-label-3)",
};

const EdgeLayer = memo(function EdgeLayer({
  edges,
  width,
  height,
  chainRef,
}: {
  edges: LaidOutEdge[];
  width: number;
  height: number;
  /** Filled imperatively with copies of the lit chain, so it draws above everything else. */
  chainRef: React.RefObject<SVGGElement | null>;
}) {
  const ordered = useMemo(() => [...edges].sort((a, b) => edgeRank(a) - edgeRank(b)), [edges]);
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden="true">
      <defs>
        {(Object.keys(EDGE_COLOR) as EdgeKind[]).map((id) => (
          <marker key={id} id={`ms-arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
            <path d="M 1 1 L 9 5 L 1 9 z" style={{ fill: EDGE_COLOR[id] }} />
          </marker>
        ))}
      </defs>
      {ordered.map((e) => {
        const d = e.dependency;
        const kind: EdgeKind = d.satisfied ? "done" : d.critical ? "crit" : d.crossTeam ? "cross" : "norm";
        const path = edgePath(e);
        return (
          <g key={`${d.from}>${d.to}`}>
            {/* A soft halo instead of a blur filter, which would force an offscreen pass per edge. */}
            {kind === "crit" && (
              <path data-from={d.from} data-to={d.to} className="ms-edge ms-edge-halo" d={path} fill="none" strokeLinecap="round" />
            )}
            <path
              data-from={d.from}
              data-to={d.to}
              data-kind={kind}
              className="ms-edge"
              d={path}
              fill="none"
              markerEnd={`url(#ms-arrow-${kind})`}
              strokeDasharray={kind === "done" ? "3 3" : d.kind === "epic" ? "5 4" : undefined}
              strokeLinecap="round"
              style={{ stroke: EDGE_COLOR[kind], strokeWidth: kind === "crit" ? 2 : kind === "done" ? 1 : 1.4 }}
            />
          </g>
        );
      })}
      <g ref={chainRef} />
    </svg>
  );
});

/**
 * Slack only shows for the chain being explored (CSS reveals the lit bars):
 * drawn for every card at once, the bars turn a large milestone into a wall of
 * stripes.
 */
const SlackLayer = memo(function SlackLayer({ cards }: { cards: LaidOutCard[] }) {
  return (
    <>
      {cards.map((c) => {
        const slack = c.item.schedule?.slack ?? 0;
        if (slack <= 0 || !c.slackX2) return null;
        // Sits in the row gap under the card, reaching to the right edge of the
        // latest column it can start in without moving the milestone.
        return (
          <div
            key={c.item.key}
            data-k={c.item.key}
            className="ms-slack absolute"
            title={`${c.item.key} can slip ${steps(slack)} without delaying the milestone`}
            style={{ left: c.x + 10, top: c.y + CARD_HEIGHT + (ROW_GAP - 4) / 2, height: 4, width: c.slackX2 - c.x - 10 }}
          />
        );
      })}
    </>
  );
});

const OverflowLayer = memo(function OverflowLayer({ overflows }: { overflows: Overflow[] }) {
  return (
    <>
      {overflows.map((o) => (
        <button
          key={`${o.laneId}#${o.column}`}
          type="button"
          data-more={o.laneId}
          tabIndex={-1}
          title={`Show all ${o.hidden + CELL_LIMIT} cards in this step`}
          className="ms-more absolute flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-medium text-[var(--ms-label-2)]"
          style={{ left: o.x, top: o.y, width: CARD_WIDTH, height: OVERFLOW_HEIGHT }}
        >
          {o.hidden} more
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </>
  );
});

// ── Minimap ─────────────────────────────────────────────────────────────────
//
// Overview of every card with the visible region outlined. The viewport box
// follows scrolling through direct style writes, so scrolling never
// re-renders the map (or the timeline).

const MAP_W = 196;
const MAP_MAX_H = 120;

const Minimap = memo(function Minimap({
  cards,
  width,
  height,
  zoom,
  scrollRef,
}: {
  cards: LaidOutCard[];
  width: number;
  height: number;
  zoom: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Fixed footprint with independent axis scales: a tall program would
  // otherwise shrink to an unreadable sliver.
  const w = MAP_W;
  const h = Math.min(MAP_MAX_H, Math.max(56, height * (MAP_W / width) * 2));
  const sx = w / width;
  const sy = h / height;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const box = boxRef.current;
    if (!el || !box) return;
    const sync = () => {
      const vx = (el.scrollLeft / zoom) * sx;
      const vy = (el.scrollTop / zoom) * sy;
      const vw = ((el.clientWidth - LANE_W) / zoom) * sx;
      const vh = ((el.clientHeight - HEADER_H) / zoom) * sy;
      box.style.transform = `translate(${vx}px, ${vy}px)`;
      box.style.width = `${Math.min(w, vw)}px`;
      box.style.height = `${Math.min(h, vh)}px`;
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollRef, zoom, sx, sy, w, h]);

  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / sx;
    const y = (e.clientY - r.top) / sy;
    el.scrollTo({
      left: x * zoom - (el.clientWidth - LANE_W) / 2,
      top: y * zoom - (el.clientHeight - HEADER_H) / 2,
    });
  };

  return (
    <div className="ms-material absolute bottom-[60px] right-4 z-30 hidden rounded-xl p-2 lg:block" aria-hidden="true">
      <div
        className="relative cursor-pointer touch-none"
        style={{ width: w, height: h }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) jump(e);
        }}
      >
        <svg width={w} height={h} className="absolute inset-0">
          {cards.map((c) => (
            <rect
              key={c.item.key}
              x={(c.x - LANE_W) * sx}
              y={c.y * sy}
              width={Math.max(1.5, CARD_WIDTH * sx)}
              height={Math.max(1.5, CARD_HEIGHT * sy)}
              rx={1}
              style={{ fill: c.item.schedule?.critical ? "var(--ms-critical)" : "var(--ms-label-3)", opacity: c.item.schedule?.critical ? 0.9 : 0.45 }}
            />
          ))}
        </svg>
        <div
          ref={boxRef}
          className="pointer-events-none absolute left-0 top-0 rounded-[3px] border-[1.5px] border-[var(--ms-accent)] bg-[color-mix(in_srgb,var(--ms-accent)_10%,transparent)]"
        />
      </div>
    </div>
  );
});

// ── Timeline ────────────────────────────────────────────────────────────────

/**
 * Memoised: a poll that returns unchanged data keeps the same `detail`
 * object, so the page's re-render (toolbar status, refresh flag) stops here.
 */
export default memo(CriticalPathTimeline);

function CriticalPathTimeline({
  detail,
  laneMode,
  selectedKey,
  onSelect,
  matches,
  showDone = false,
  showOutside = true,
  onOpenTeam,
  onInspect,
}: Props) {
  // Unfolded lanes are per-milestone view state: tagged with the release so
  // switching milestones starts folded again without an effect.
  const releaseId = detail.release.id;
  const [fold, setFold] = useState<{ release: string; lanes: ReadonlySet<string>; pin: string | null }>({
    release: releaseId,
    lanes: new Set(),
    pin: null,
  });
  const expandedLanes = fold.release === releaseId ? fold.lanes : EMPTY_SET;
  const pin = fold.release === releaseId ? fold.pin : null;

  // Filtering hides lanes without a match; columns stay put so the schedule
  // still reads the same, and non-matching cards in kept lanes are dimmed.
  const base = useMemo(
    () =>
      layoutTimeline(detail, laneMode, {
        showDone,
        showOutside,
        expandedLanes,
        pinnedKey: pin,
        prefer: matches,
        includeLane: matches ? (members) => members.some((m) => matches.has(m.key)) : undefined,
      }),
    [detail, laneMode, matches, showDone, showOutside, expandedLanes, pin],
  );

  const setLaneExpanded = useCallback(
    (lane: string, expanded: boolean) => {
      setFold((prev) => {
        const lanes = new Set(prev.release === releaseId ? prev.lanes : []);
        if (expanded) lanes.add(lane);
        else lanes.delete(lane);
        // Folding back keeps the selection on screen (see layoutTimeline's pinnedKey).
        return { release: releaseId, lanes, pin: selectedKey };
      });
    },
    [releaseId, selectedKey],
  );

  // Selecting a folded card (filter, inspector, panels) unfolds its lane so the
  // card has somewhere to be. Adjusted during render, not in an effect, so the
  // reveal below already sees the unfolded layout.
  const [seenSelection, setSeenSelection] = useState<string | null>(null);
  if (selectedKey !== seenSelection) {
    setSeenSelection(selectedKey);
    const lane = selectedKey ? base.hiddenLane?.get(selectedKey) : undefined;
    if (lane) setLaneExpanded(lane, true);
  }

  const colors = useMemo(
    () => teamColors([...detail.teams.map((t) => t.name), ...detail.items.map((i) => i.team)]),
    [detail.teams, detail.items],
  );
  const layout = useMemo(() => {
    // Mark the first lane of each team so team boundaries read as groups.
    const lanes: LaneView[] = base.lanes.map((l, i) => ({
      ...l,
      newTeam: i > 0 && base.lanes[i - 1]?.team !== l.team,
      color: colors.get(l.team) ?? "#8e8e93",
    }));
    return { ...base, lanes };
  }, [base, colors]);
  const chainOf = useMemo(() => chainIndex(detail.dependencies, showDone), [detail.dependencies, showDone]);
  const teamByName = useMemo(() => new Map(detail.teams.map((t) => [t.name, t])), [detail.teams]);
  const cardByKey = useMemo(() => new Map(layout.cards.map((c) => [c.item.key, c])), [layout.cards]);
  const columnCounts = layout.columnStats ?? [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  const [win, setWin] = useState<Rect | null>(null);
  const hoverRef = useRef<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const selectedRef = useRef(selectedKey);
  useLayoutEffect(() => {
    selectedRef.current = selectedKey;
    zoomRef.current = zoom;
  });

  // Canvas coordinates: layout x minus the lane header gutter.
  const canvasW = layout.width - LANE_W;
  const canvasH = layout.height;

  // The scroll container only exists while there are cards (empty and
  // no-match states render without it); listeners re-attach when it returns.
  const hasCards = layout.cards.length > 0;

  // ── Culling ──
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const z = zoomRef.current;
    const r = cullWindow(
      { left: Math.max(0, el.scrollLeft), top: Math.max(0, el.scrollTop), width: el.clientWidth, height: el.clientHeight },
      z,
    );
    // Layout x is offset by the lane gutter (see the canvas transform).
    const next = { ...r, x: r.x + LANE_W };
    setWin((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure, hasCards]);

  useEffect(measure, [zoom, measure]);

  const shownCards = useMemo(() => visibleCards(layout.cards, win), [layout.cards, win]);
  const shownEdges = useMemo(() => visibleEdges(layout.edges, win), [layout.edges, win]);

  // ── Focus highlighting (DOM-driven: no React render on hover) ──
  const focusSet = useCallback(
    (key: string | null): { members: Set<string>; hasEdge: (from: string, to: string) => boolean } | null => {
      if (!key) return null;
      if (cardByKey.has(key)) {
        const chain = chainOf(key);
        return { members: chain.members, hasEdge: (from, to) => chainHasEdge(chain, from, to) };
      }
      const group = (keys: string[]) => {
        const members = new Set(keys.filter((k) => cardByKey.has(k)));
        return members.size ? { members, hasEdge: (from: string, to: string) => members.has(from) && members.has(to) } : null;
      };
      const epic = detail.epics.find((e) => e.key === key);
      if (epic) return group(epic.itemKeys);
      return group(detail.items.filter((i) => i.incrementKey === key).map((i) => i.key));
    },
    [cardByKey, chainOf, detail.epics, detail.items],
  );

  const chainRef = useRef<SVGGElement>(null);
  const applyFocus = useCallback(() => {
    const root = canvasRef.current;
    if (!root) return;
    const chain = focusSet(hoverRef.current ?? selectedRef.current);
    const overlay = chainRef.current;
    overlay?.replaceChildren();
    root.toggleAttribute("data-focus", !!chain);
    root.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      el.toggleAttribute("data-lit", !!chain && chain.members.has(el.dataset.k ?? ""));
    });
    const lit: Node[] = [];
    root.querySelectorAll<SVGPathElement>("path[data-from]").forEach((el) => {
      const on = !!chain && chain.hasEdge(el.dataset.from ?? "", el.dataset.to ?? "");
      el.toggleAttribute("data-lit", on);
      if (on && el.dataset.kind) lit.push(el.cloneNode(false));
    });
    // The chain draws above every other edge. Copies go into a group React
    // renders empty (and so never reconciles), leaving React's own nodes in place.
    if (lit.length) overlay?.append(...lit);
  }, [focusSet]);

  // Newly mounted (un-culled) nodes need the current highlight too.
  const applyFocusRef = useRef(applyFocus);
  useLayoutEffect(() => {
    applyFocusRef.current = applyFocus;
    applyFocus();
  });

  // ── Tooltip: one element, filled and positioned imperatively ──
  const shellRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<number | null>(null);
  const tipWarmUntil = useRef(0);

  const hideTip = useCallback(() => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    const tip = tipRef.current;
    if (tip && tip.dataset.open !== undefined) {
      delete tip.dataset.open;
      // Moving straight to another card shows its tooltip without the delay.
      tipWarmUntil.current = performance.now() + 400;
    }
  }, []);

  const showTip = useCallback(
    (card: HTMLElement, key: string) => {
      if (tipTimer.current) window.clearTimeout(tipTimer.current);
      const open = () => {
        const tip = tipRef.current;
        const shell = shellRef.current;
        const c = cardByKey.get(key);
        if (!tip || !shell || !c || !card.isConnected) return;
        const lines = tooltipLines(c.item);
        const [title, meta, schedule] = Array.from(tip.children) as HTMLElement[];
        if (title) title.textContent = lines.title;
        if (meta) meta.textContent = lines.meta;
        if (schedule) {
          schedule.textContent = lines.schedule;
          schedule.hidden = !lines.schedule;
        }
        const r = card.getBoundingClientRect();
        const box = shell.getBoundingClientRect();
        const width = 280;
        const left = Math.min(Math.max(8, r.left - box.left), box.width - width - 8);
        const below = r.bottom - box.top + 8;
        tip.style.width = `${width}px`;
        tip.style.left = `${left}px`;
        tip.style.top = `${below}px`;
        tip.dataset.open = "";
        // Flip above the card when it would run off the bottom.
        if (below + tip.offsetHeight > box.height - 8) tip.style.top = `${r.top - box.top - tip.offsetHeight - 8}px`;
      };
      if (performance.now() < tipWarmUntil.current) open();
      else tipTimer.current = window.setTimeout(open, TOOLTIP_DELAY_MS);
    },
    [cardByKey],
  );

  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".ms-card");
      const key = card?.dataset.k ?? null;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (key && card) {
        if (hoverRef.current !== key) {
          hoverRef.current = key;
          applyFocus();
          hideTip();
          if (e.pointerType === "mouse") showTip(card, key);
        }
        return;
      }
      hideTip();
      // A lit slack bar belongs to the chain being explored; pointing at it to
      // read its tooltip mustn't make it vanish.
      if ((e.target as HTMLElement).closest(".ms-slack")) return;
      // Crossing the gap between two cards shouldn't flash the whole graph.
      hoverTimer.current = window.setTimeout(() => {
        if (hoverRef.current !== null) {
          hoverRef.current = null;
          applyFocus();
        }
      }, HOVER_CLEAR_MS);
    },
    [applyFocus, hideTip, showTip],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", hideTip, { passive: true });
    return () => el.removeEventListener("scroll", hideTip);
  }, [hideTip, hasCards]);

  const onPointerLeave = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverRef.current = null;
    applyFocus();
    hideTip();
  }, [applyFocus, hideTip]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      hideTip();
      const target = e.target as HTMLElement;
      const more = target.closest<HTMLElement>("[data-more]")?.dataset.more;
      if (more) {
        setLaneExpanded(more, true);
        return;
      }
      if (target.closest(".ms-slack")) return;
      onSelect(target.closest<HTMLElement>(".ms-card")?.dataset.k ?? null);
    },
    [onSelect, hideTip, setLaneExpanded],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>(".ms-card")?.dataset.k;
      if (key && onInspect) onInspect(key);
    },
    [onInspect],
  );

  // ── Scrolling a card into view (works for culled cards: uses layout) ──
  const reveal = useCallback((key: string, smooth: boolean) => {
    const el = scrollRef.current;
    const c = cardByKey.get(key);
    if (!el || !c) return;
    const z = zoomRef.current;
    const left = (c.x - LANE_W) * z + LANE_W;
    const top = c.y * z + HEADER_H;
    const pad = 32;
    // The inspector floats over the right edge; keep the card clear of it.
    const rightInset = el.clientWidth > 900 ? INSPECTOR_W : 0;
    const viewW = el.clientWidth - rightInset;
    let x = el.scrollLeft;
    let y = el.scrollTop;
    if (!smooth) {
      // First reveal (deep link): centre the card in the free area.
      x = left - LANE_W - (viewW - LANE_W - CARD_WIDTH * z) / 2;
      y = top - HEADER_H - (el.clientHeight - HEADER_H - CARD_HEIGHT * z) / 2;
    } else {
      if (left - LANE_W - pad < el.scrollLeft) x = left - LANE_W - pad;
      else if (left + CARD_WIDTH * z + pad > el.scrollLeft + viewW) x = left + CARD_WIDTH * z + pad - viewW;
      if (top - HEADER_H - pad < el.scrollTop) y = top - HEADER_H - pad;
      else if (top + CARD_HEIGHT * z + pad > el.scrollTop + el.clientHeight) y = top + CARD_HEIGHT * z + pad - el.clientHeight;
    }
    if (x !== el.scrollLeft || y !== el.scrollTop) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: smooth && !reduce ? "smooth" : "auto" });
    }
  }, [cardByKey]);

  // Selecting from elsewhere (inspector, URL, panels) brings the card into view.
  // Only a *selection change* does: a poll or filter that re-lays out the
  // timeline must not yank the scroll position back to the selection.
  const firstReveal = useRef(true);
  const revealRef = useRef(reveal);
  useLayoutEffect(() => {
    revealRef.current = reveal;
  });
  useEffect(() => {
    // A new selection (often from the keyboard) wins over a pointer that
    // happens to rest on another card, until the pointer moves again.
    if (hoverRef.current) {
      hoverRef.current = null;
      applyFocusRef.current();
    }
    // Only a selection present at mount (a shared link) is centred.
    if (selectedKey) revealRef.current(selectedKey, !firstReveal.current);
    firstReveal.current = false;
  }, [selectedKey]);

  const focusCard = useCallback((key: string) => {
    // The card may only mount after the scroll un-culls it.
    let tries = 0;
    const attempt = () => {
      const el = canvasRef.current?.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"].ms-card`);
      if (el) el.focus({ preventScroll: true });
      else if (tries++ < 20) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, []);

  // ── Zoom ──
  const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const el = scrollRef.current;
    const z0 = zoomRef.current;
    // 3 decimals: coarser rounding swallows the small steps of a slow pinch.
    const z1 = clampZoom(Math.round(next * 1000) / 1000);
    if (!el || z1 === z0) return;
    // Keep the point under the anchor (default: viewport centre) still.
    const ax = anchor?.x ?? el.clientWidth / 2;
    const ay = anchor?.y ?? el.clientHeight / 2;
    const cx = (el.scrollLeft + ax - LANE_W) / z0;
    const cy = (el.scrollTop + ay - HEADER_H) / z0;
    zoomRef.current = z1;
    setZoom(z1);
    requestAnimationFrame(() => {
      el.scrollLeft = cx * z1 + LANE_W - ax;
      el.scrollTop = cy * z1 + HEADER_H - ay;
    });
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    const z = zoomRef.current;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
    if (next) zoomTo(next);
  }, [zoomTo]);

  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const zx = (el.clientWidth - LANE_W - 16) / canvasW;
    const zy = (el.clientHeight - HEADER_H - 16) / canvasH;
    const z = clampZoom(Math.min(1, zx, zy));
    zoomRef.current = z;
    setZoom(Math.round(z * 100) / 100);
    el.scrollTo({ left: 0, top: 0 });
  }, [canvasW, canvasH]);

  // Pinch / ⌘-scroll zoom around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, hasCards]);

  // ── Keyboard ──
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dirs: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        const from = selectedKey && cardByKey.has(selectedKey) ? selectedKey : null;
        const next = neighbor(layout.cards, from, dir);
        if (next) {
          onSelect(next);
          focusCard(next);
        }
        return;
      }
      if (e.key === "Enter" && onInspect && selectedKey && cardByKey.has(selectedKey)) {
        // Also stops the focused card's own button activation re-selecting it.
        e.preventDefault();
        onInspect(selectedKey);
        return;
      }
      if (e.key === "+" || e.key === "=") step(1);
      else if (e.key === "-") step(-1);
      else if (e.key === "0") fit();
    },
    [cardByKey, focusCard, layout.cards, onSelect, onInspect, selectedKey, step, fit],
  );

  if (layout.cards.length === 0 && matches) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-[17px] font-semibold text-[var(--ms-label)]">No matching work</div>
        <p className="max-w-sm text-[13px] text-[var(--ms-label-2)]">
          Nothing remaining matches the filter. Try a key, a summary word, a person or a team.
        </p>
      </div>
    );
  }

  if (layout.cards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ms-ready-fill)] text-2xl text-[var(--ms-ready-text)]" aria-hidden="true">
          ✓
        </div>
        <div className="text-[17px] font-semibold text-[var(--ms-label)]">Nothing left on the critical path</div>
        <p className="max-w-sm text-[13px] text-[var(--ms-label-2)]">
          {showDone
            ? "This milestone has no work items yet."
            : "Every work item in this milestone is done. Show done items to see what was delivered."}
        </p>
      </div>
    );
  }

  const shownOverflows = (layout.overflows ?? []).filter(
    (o) => !win || (o.x < win.x + win.width && o.x + CARD_WIDTH > win.x && o.y < win.y + win.height && o.y + OVERFLOW_HEIGHT > win.y),
  );

  const activeKey = selectedKey && cardByKey.has(selectedKey) ? selectedKey : (layout.cards[0]?.item.key ?? null);
  const totalW = canvasW * zoom + LANE_W;
  const totalH = canvasH * zoom + HEADER_H;
  const pctLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div ref={shellRef} className="absolute inset-0">
      <div ref={tipRef} role="tooltip" className="ms-tip ms-material pointer-events-none absolute z-50 rounded-xl px-3 py-2.5">
        <div className="text-[13px] font-semibold leading-snug text-[var(--ms-label)]" />
        <div className="mt-0.5 text-[11.5px] text-[var(--ms-label-2)]" />
        <div className="mt-1.5 border-t border-[var(--ms-sep)] pt-1.5 text-[11.5px] leading-snug text-[var(--ms-label-2)]" />
      </div>
      <div
        ref={scrollRef}
        role="application"
        aria-roledescription="critical path timeline"
        aria-label={`Critical path timeline. Use arrow keys to move between work items${onInspect ? ", Return to open the selected item" : ""}, Escape to clear the selection, plus and minus to zoom.`}
        onKeyDown={onKeyDown}
        // Focusable itself so arrow keys work even when the active card is culled.
        tabIndex={0}
        className="absolute inset-0 overflow-auto overscroll-contain focus-visible:rounded-none focus-visible:outline-offset-[-2px]"
      >
        <div className="relative" style={{ width: totalW, height: totalH }}>
          {/* Column headers — sticky to the top */}
          <div className="ms-chrome sticky top-0 z-20 flex border-b border-[var(--ms-sep)]" style={{ height: HEADER_H, width: totalW }}>
            <div
              className="sticky left-0 z-10 flex items-center border-r bg-[var(--ms-bg)] border-[var(--ms-sep)] px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-label-3)]"
              style={{ width: LANE_W }}
            >
              {laneMode === "team" ? "Team" : "Epic"}
            </div>
            <div className="relative" style={{ width: canvasW * zoom }}>
              {columnCounts.map((count, column) => (
                <div
                  key={column}
                  role="columnheader"
                  title={columnHelp(count.level)}
                  className="absolute top-0 flex h-full flex-col items-center justify-center leading-tight"
                  style={{ left: (columnX(column) - COLUMN_GAP / 2 - LANE_W) * zoom, width: (CARD_WIDTH + COLUMN_GAP) * zoom }}
                >
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      count.level === 0 ? "text-[var(--ms-ready-text)]" : count.level === null ? "text-[var(--ms-label-3)]" : "text-[var(--ms-label)]",
                    )}
                  >
                    {columnTitle(count.level)}
                  </span>
                  {zoom >= 0.65 && (
                    <span className="text-[10.5px] tabular-nums text-[var(--ms-label-3)]">
                      {count.total} item{count.total === 1 ? "" : "s"}
                      {count.critical > 0 && <span className="text-[var(--ms-critical-text)]"> · {count.critical} critical</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* Lane headers — sticky to the left */}
            <div className="sticky left-0 z-10 shrink-0 bg-[var(--ms-bg)]" style={{ width: LANE_W, height: canvasH * zoom }}>
              {layout.lanes.map((lane, i) => {
                const team = laneMode === "team" && !lane.external ? teamByName.get(lane.team) : undefined;
                const openTeam = laneMode === "team" && onOpenTeam ? () => onOpenTeam(lane.team) : undefined;
                const roomy = zoom >= 0.65;
                return (
                  <div
                    key={lane.id}
                    data-external={lane.external ? "" : undefined}
                    data-clickable={openTeam ? "" : undefined}
                    onClick={openTeam}
                    className={cn(
                      // Top-aligned with the lane's first row of cards, not floating mid-lane.
                      // overflow-clip (not hidden) keeps the sticky title below working.
                      "ms-lane-head absolute left-2 right-0 flex flex-col overflow-clip pl-3 pr-3",
                      roomy ? "justify-start" : "justify-center",
                    )}
                    style={{ top: lane.y * zoom, height: lane.height * zoom, paddingTop: roomy ? 14 * zoom : undefined, "--tint": lane.color } as React.CSSProperties}
                    title={openTeam ? `Show ${lane.team}` : `${lane.title}\n${lane.subtitle}`}
                  >
                    {/* Sticks under the column header while a tall lane scrolls past. */}
                    <div className="sticky flex min-w-0 flex-col" style={{ top: HEADER_H + 12 }}>
                      {laneMode === "epic" && (i === 0 || lane.newTeam) && roomy && !lane.external && (
                        <div className="mb-1 truncate pl-[14px] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-label-3)]">
                          {lane.team}
                        </div>
                      )}
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span aria-hidden="true" className={cn("shrink-0 rounded-full", roomy ? "mt-[4px] h-2 w-2" : "mt-[3px] h-[7px] w-[7px]")} style={{ background: lane.color }} />
                        {openTeam ? (
                          <button
                            type="button"
                            className={cn("ms-lane-title min-w-0 text-left font-semibold leading-tight text-[var(--ms-label)]", roomy ? "line-clamp-2 text-[13px]" : "truncate text-[12px]")}
                          >
                            {lane.title}
                          </button>
                        ) : (
                          <div className={cn("min-w-0 font-semibold leading-tight text-[var(--ms-label)]", roomy ? "line-clamp-2 text-[13px]" : "truncate text-[12px]")}>
                            {lane.title}
                          </div>
                        )}
                      </div>
                      {roomy && <div className="mt-0.5 truncate text-[11px] text-[var(--ms-label-3)]">{lane.subtitle}</div>}
                      {roomy && lane.external && (
                        <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--ms-fill)] px-1.5 py-[2px] text-[10px] font-semibold text-[var(--ms-label-2)]">
                          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                            <path d="M4 1.5H1.5v7h7V6M6 1.5h2.5V4M8.5 1.5 4.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Outside milestone
                        </div>
                      )}
                      {team && roomy && (
                        <div className="mt-1 text-[11px] leading-snug text-[var(--ms-label-3)]">
                          {team.readyNow} ready · {team.unassignedRemaining} unassigned
                          {team.waitingOnOtherTeams > 0 && <div>waits on others for {team.waitingOnOtherTeams}</div>}
                        </div>
                      )}
                      {lane.critical > 0 && zoom >= 0.8 && (
                        <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--ms-critical-fill)] px-1.5 py-[2px] text-[10px] font-semibold text-[var(--ms-critical-text)]">
                          {lane.critical} critical
                        </div>
                      )}
                      {lane.collapsible && roomy && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLaneExpanded(lane.id, !lane.expanded);
                          }}
                          title={lane.expanded ? "Fold crowded steps back to their most important cards" : "Show every card in this lane"}
                          className="mt-1.5 w-fit rounded text-[11px] font-medium text-[var(--ms-accent-text)] hover:underline"
                        >
                          {lane.expanded ? "Show fewer" : "Show all"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Canvas — scaled as one layer so zoom is a single compositor transform */}
            <div className="relative shrink-0 overflow-hidden" style={{ width: canvasW * zoom, height: canvasH * zoom }}>
              <div
                ref={canvasRef}
                className="ms-canvas absolute left-0 top-0 origin-top-left"
                data-filter={matches ? "" : undefined}
                data-compact={zoom < 0.65 ? "" : undefined}
                style={{ width: layout.width, height: canvasH, transform: `scale(${zoom}) translateX(${-LANE_W}px)` }}
                onPointerOver={onPointerOver}
                onPointerLeave={onPointerLeave}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
              >
                <LaneBands lanes={layout.lanes} width={layout.width} />
                <SlackLayer cards={shownCards} />
                <EdgeLayer edges={shownEdges} width={layout.width} height={canvasH} chainRef={chainRef} />
                <OverflowLayer overflows={shownOverflows} />
                {shownCards.map((c) => (
                  <Card
                    key={c.item.key}
                    item={c.item}
                    x={c.x}
                    y={c.y}
                    selected={selectedKey === c.item.key}
                    focusable={activeKey === c.item.key}
                    match={!!matches?.has(c.item.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend — floating material, bottom left */}
      <div className="ms-material pointer-events-none absolute bottom-4 left-4 z-30 hidden items-center gap-4 rounded-full px-4 py-2 text-[11px] font-medium text-[var(--ms-label-2)] md:flex">
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[var(--ms-critical)]" />Critical</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[var(--ms-cross)]" />Cross-team</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-[var(--ms-edge)]" />Epic link</span>
        {layout.doneColumn && (
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-[var(--ms-label-3)]" />Done</span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-5 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--ms-accent)_50%,transparent),color-mix(in_srgb,var(--ms-accent)_6%,transparent))]" />
          Slack
        </span>
        <span className="flex items-center gap-1.5"><span className="rounded-full bg-[var(--ms-cross-fill)] px-1 text-[10px] font-semibold text-[var(--ms-cross-text)]">⇄</span>Blocks other teams</span>
      </div>

      {layout.cards.length > 24 && (
        <Minimap cards={layout.cards} width={canvasW} height={canvasH} zoom={zoom} scrollRef={scrollRef} />
      )}

      {/* Zoom — floating material, bottom right */}
      <div
        role="toolbar"
        aria-label="Zoom"
        className="ms-material absolute bottom-4 right-4 z-30 flex items-center gap-0.5 rounded-full p-1 text-[var(--ms-label-2)]"
      >
        <button type="button" onClick={() => step(-1)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" title="Zoom out (−)" className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] hover:bg-[var(--ms-fill)] disabled:opacity-30">
          −
        </button>
        <button type="button" onClick={() => zoomTo(1)} aria-label={`Zoom ${pctLabel}, reset to 100%`} title="Actual size" className="min-w-[46px] rounded-full px-1 py-1 text-[11.5px] font-semibold tabular-nums hover:bg-[var(--ms-fill)]">
          {pctLabel}
        </button>
        <button type="button" onClick={() => step(1)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)" className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] hover:bg-[var(--ms-fill)] disabled:opacity-30">
          +
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--ms-sep-strong)]" aria-hidden="true" />
        <button type="button" onClick={fit} aria-label="Fit to screen" title="Fit to screen (0)" className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold hover:bg-[var(--ms-fill)]">
          Fit
        </button>
      </div>
    </div>
  );
}
