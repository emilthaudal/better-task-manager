"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CARD_HEIGHT, CARD_WIDTH, COLUMN_GAP, LANE_HEADER_WIDTH, columnX, layoutTimeline } from "@/lib/milestoneLayout";
import type { LaidOutCard, LaidOutEdge, Lane, LaneMode } from "@/lib/milestoneLayout";
import { chainIndex, cullWindow, neighbor, visibleCards, visibleEdges } from "@/lib/milestoneView";
import type { Direction, Rect } from "@/lib/milestoneView";
import type { MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";
import { Avatar, StatusDot } from "./MilestoneBits";

interface Props {
  detail: MilestoneDetail;
  laneMode: LaneMode;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Keys matching the filter, or null when no filter is active. */
  matches: Set<string> | null;
}

const HEADER_H = 40;
const LANE_W = LANE_HEADER_WIDTH;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5];
const HOVER_CLEAR_MS = 90;
/** Width of the floating inspector plus its margin. */
const INSPECTOR_W = 396;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function edgePath(e: LaidOutEdge): string {
  const dx = Math.max(28, (e.x2 - e.x1) / 2);
  return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2 - 2} ${e.y2}`;
}

function cardTitle(item: WorkItem): string {
  const s = item.schedule;
  const lines = [`${item.key} · ${item.summary}`, `${item.team}${item.assignee ? ` · ${item.assignee}` : " · Unassigned"}`];
  if (s) {
    lines.push(s.critical ? "On the critical path" : `${s.slack} step${s.slack === 1 ? "" : "s"} of slack`);
    if (s.downstream > 0) lines.push(`Unblocks ${s.downstream}${s.downstreamTeams.length ? ` (${s.downstreamTeams.join(", ")})` : ""}`);
  }
  return lines.join("\n");
}

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
  const crossTeams = s?.downstreamTeams.length ?? 0;
  return (
    <button
      type="button"
      data-k={item.key}
      data-selected={selected ? "" : undefined}
      data-match={match ? "" : undefined}
      tabIndex={focusable ? 0 : -1}
      aria-pressed={selected}
      aria-label={`${item.key}: ${item.summary}${critical ? ", critical" : ""}${s?.ready ? ", ready" : ""}`}
      title={cardTitle(item)}
      className={cn(
        "ms-card absolute flex flex-col justify-between overflow-hidden rounded-xl bg-[var(--ms-surface)] py-2 pl-3 pr-2.5 text-left",
        item.external && "bg-[var(--ms-warn-fill)] outline-1 outline-dashed -outline-offset-1 outline-[var(--ms-warn)]",
      )}
      style={{ left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      {critical && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--ms-critical)]" />}
      <div className="flex items-center gap-1.5">
        <StatusDot status={item.status} />
        <span
          className={cn(
            "font-mono text-[11px] font-medium",
            critical ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]",
          )}
        >
          {item.key}
        </span>
        {item.external && <span className="text-[10px] font-semibold text-[var(--ms-warn-text)]">Outside</span>}
        <span className="ml-auto flex items-center gap-1">
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
          {!critical && s && s.slack > 0 && (
            <span className="text-[10px] font-medium tabular-nums text-[var(--ms-label-3)]">+{s.slack}</span>
          )}
        </span>
      </div>
      <div className="line-clamp-2 text-[12.5px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--ms-label)]">{item.summary}</div>
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--ms-label-3)]">
        <Avatar name={item.assignee} size={14} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !item.assignee && critical && "font-semibold text-[var(--ms-warn-text)]",
          )}
        >
          {item.assignee ?? "Unassigned"}
        </span>
        {s && s.downstream > 0 && <span className="shrink-0 tabular-nums">→ {s.downstream}</span>}
      </div>
    </button>
  );
});

// ── Static layers (memoised: they only change with layout / culling) ───────

type LaneView = Lane & { newTeam: boolean };

const LaneBands = memo(function LaneBands({ lanes, width }: { lanes: LaneView[]; width: number }) {
  return (
    <>
      {lanes.map((lane, i) => (
        <div
          key={lane.id}
          aria-hidden="true"
          className={cn("absolute left-0 border-t", i % 2 === 1 && "bg-[var(--ms-lane)]", lane.newTeam ? "border-[var(--ms-sep-strong)]" : "border-[var(--ms-sep)]")}
          style={{ top: lane.y, height: lane.height, width }}
        />
      ))}
    </>
  );
});

const EdgeLayer = memo(function EdgeLayer({ edges, width, height }: { edges: LaidOutEdge[]; width: number; height: number }) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden="true">
      <defs>
        {(["crit", "cross", "norm"] as const).map((id) => (
          <marker key={id} id={`ms-arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
            <path
              d="M 1 1 L 9 5 L 1 9 z"
              style={{ fill: id === "crit" ? "var(--ms-critical)" : id === "cross" ? "var(--ms-cross)" : "var(--ms-edge)" }}
            />
          </marker>
        ))}
      </defs>
      {edges.map((e) => {
        const d = e.dependency;
        const kind = d.critical ? "crit" : d.crossTeam ? "cross" : "norm";
        return (
          <path
            key={`${d.from}>${d.to}`}
            data-from={d.from}
            data-to={d.to}
            className="ms-edge"
            d={edgePath(e)}
            fill="none"
            markerEnd={`url(#ms-arrow-${kind})`}
            strokeDasharray={d.kind === "epic" ? "5 4" : undefined}
            strokeLinecap="round"
            style={{
              stroke: kind === "crit" ? "var(--ms-critical)" : kind === "cross" ? "var(--ms-cross)" : "var(--ms-edge)",
              strokeWidth: d.critical ? 2 : 1.4,
            }}
          />
        );
      })}
    </svg>
  );
});

const SlackLayer = memo(function SlackLayer({ cards }: { cards: LaidOutCard[] }) {
  return (
    <>
      {cards.map((c) => {
        const slack = c.item.schedule?.slack ?? 0;
        if (slack <= 0) return null;
        // A slim track under the card: how far it could slide right
        // without moving the milestone. Ends in a tick at the latest start.
        return (
          <div
            key={c.item.key}
            data-k={c.item.key}
            aria-hidden="true"
            className="ms-slack absolute flex items-center"
            style={{
              left: c.x + 14,
              top: c.y + CARD_HEIGHT + 2,
              height: 6,
              width: slack * (CARD_WIDTH + COLUMN_GAP) - 14,
            }}
          >
            <div className="h-[2px] flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--ms-sep-strong)_0_4px,transparent_4px_7px)]" />
            <div className="h-[6px] w-[2px] rounded-full bg-[var(--ms-sep-strong)]" />
          </div>
        );
      })}
    </>
  );
});

// ── Timeline ────────────────────────────────────────────────────────────────

export default function CriticalPathTimeline({ detail, laneMode, selectedKey, onSelect, matches }: Props) {
  // Filtering hides lanes without a match; columns stay put so the schedule
  // still reads the same, and non-matching cards in kept lanes are dimmed.
  const base = useMemo(
    () => layoutTimeline(detail, laneMode, matches ? { includeLane: (members) => members.some((m) => matches.has(m.key)) } : {}),
    [detail, laneMode, matches],
  );
  const layout = useMemo(() => {
    // Mark the first lane of each team so team boundaries read as groups.
    const lanes: LaneView[] = base.lanes.map((l, i) => ({ ...l, newTeam: i > 0 && base.lanes[i - 1]?.team !== l.team }));
    return { ...base, lanes };
  }, [base]);
  const chainOf = useMemo(() => chainIndex(detail.dependencies), [detail.dependencies]);
  const cardByKey = useMemo(() => new Map(layout.cards.map((c) => [c.item.key, c])), [layout.cards]);
  const columnCounts = useMemo(() => {
    const counts = Array.from({ length: layout.columns }, () => ({ total: 0, critical: 0 }));
    for (const c of layout.cards) {
      const s = c.item.schedule;
      const slot = counts[s?.earliestStart ?? 0];
      if (!slot) continue;
      slot.total++;
      if (s?.critical) slot.critical++;
    }
    return counts;
  }, [layout]);

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
  }, [measure]);

  useEffect(measure, [zoom, measure]);

  const shownCards = useMemo(() => visibleCards(layout.cards, win), [layout.cards, win]);
  const shownEdges = useMemo(() => visibleEdges(layout.edges, win), [layout.edges, win]);

  // ── Focus highlighting (DOM-driven: no React render on hover) ──
  const focusSet = useCallback(
    (key: string | null): Set<string> | null => {
      if (!key) return null;
      if (cardByKey.has(key)) return chainOf(key);
      const epic = detail.epics.find((e) => e.key === key);
      if (epic) return new Set(epic.itemKeys.filter((k) => cardByKey.has(k)));
      const inIncrement = detail.items.filter((i) => i.incrementKey === key && cardByKey.has(i.key)).map((i) => i.key);
      return inIncrement.length ? new Set(inIncrement) : null;
    },
    [cardByKey, chainOf, detail.epics, detail.items],
  );

  const applyFocus = useCallback(() => {
    const root = canvasRef.current;
    if (!root) return;
    const chain = focusSet(hoverRef.current ?? selectedRef.current);
    root.toggleAttribute("data-focus", !!chain);
    root.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      el.toggleAttribute("data-lit", !!chain && chain.has(el.dataset.k ?? ""));
    });
    root.querySelectorAll<SVGPathElement>("[data-from]").forEach((el) => {
      el.toggleAttribute("data-lit", !!chain && chain.has(el.dataset.from ?? "") && chain.has(el.dataset.to ?? ""));
    });
  }, [focusSet]);

  // Newly mounted (un-culled) nodes need the current highlight too.
  useLayoutEffect(applyFocus);

  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".ms-card");
      const key = card?.dataset.k ?? null;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (key) {
        if (hoverRef.current !== key) {
          hoverRef.current = key;
          applyFocus();
        }
        return;
      }
      // Crossing the gap between two cards shouldn't flash the whole graph.
      hoverTimer.current = window.setTimeout(() => {
        if (hoverRef.current !== null) {
          hoverRef.current = null;
          applyFocus();
        }
      }, HOVER_CLEAR_MS);
    },
    [applyFocus],
  );

  const onPointerLeave = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverRef.current = null;
    applyFocus();
  }, [applyFocus]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".ms-card");
      onSelect(card?.dataset.k ?? null);
    },
    [onSelect],
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
  const firstReveal = useRef(true);
  useEffect(() => {
    // Only a selection present at mount (a shared link) is centred.
    if (selectedKey) reveal(selectedKey, !firstReveal.current);
    firstReveal.current = false;
  }, [selectedKey, reveal]);

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
    const z1 = clampZoom(Math.round(next * 100) / 100);
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
  }, [zoomTo]);

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
      if (e.key === "+" || e.key === "=") step(1);
      else if (e.key === "-") step(-1);
      else if (e.key === "0") fit();
    },
    [cardByKey, focusCard, layout.cards, onSelect, selectedKey, step, fit],
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
          Every work item in this milestone is done. Blockers and team progress are still under Blockers &amp; teams.
        </p>
      </div>
    );
  }

  const activeKey = selectedKey && cardByKey.has(selectedKey) ? selectedKey : (layout.cards[0]?.item.key ?? null);
  const totalW = canvasW * zoom + LANE_W;
  const totalH = canvasH * zoom + HEADER_H;
  const pctLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className="absolute inset-0">
      <div
        ref={scrollRef}
        role="application"
        aria-roledescription="critical path timeline"
        aria-label="Critical path timeline. Use arrow keys to move between work items, Escape to clear the selection, plus and minus to zoom."
        onKeyDown={onKeyDown}
        className="absolute inset-0 overflow-auto overscroll-contain"
      >
        <div className="relative" style={{ width: totalW, height: totalH }}>
          {/* Column headers — sticky to the top */}
          <div className="ms-chrome sticky top-0 z-20 flex border-b border-[var(--ms-sep)]" style={{ height: HEADER_H, width: totalW }}>
            <div
              className="ms-chrome sticky left-0 z-10 flex items-center border-r border-[var(--ms-sep)] px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-label-3)]"
              style={{ width: LANE_W }}
            >
              {laneMode === "team" ? "Team" : "Epic"}
            </div>
            <div className="relative" style={{ width: canvasW * zoom }}>
              {columnCounts.map((count, level) => (
                <div
                  key={level}
                  className="absolute top-0 flex h-full flex-col items-center justify-center leading-tight"
                  style={{ left: (columnX(level) - COLUMN_GAP / 2 - LANE_W) * zoom, width: (CARD_WIDTH + COLUMN_GAP) * zoom }}
                >
                  <span className={cn("text-[12px] font-semibold", level === 0 ? "text-[var(--ms-accent-text)]" : "text-[var(--ms-label)]")}>
                    {level === 0 ? "Now" : `Step ${level + 1}`}
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
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-[var(--ms-sep)] bg-[var(--ms-bg)]"
              style={{ width: LANE_W, height: canvasH * zoom }}
            >
              {layout.lanes.map((lane, i) => (
                <div
                  key={lane.id}
                  className={cn(
                    "absolute left-0 flex w-full flex-col justify-center overflow-hidden border-t px-4",
                    i % 2 === 1 && "bg-[var(--ms-lane)]",
                    lane.newTeam ? "border-[var(--ms-sep-strong)]" : "border-[var(--ms-sep)]",
                  )}
                  style={{ top: lane.y * zoom, height: lane.height * zoom }}
                  title={`${lane.title}\n${lane.subtitle}`}
                >
                  {laneMode === "epic" && (i === 0 || lane.newTeam) && zoom >= 0.65 && (
                    <div className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-label-3)]">{lane.team}</div>
                  )}
                  <div className={cn("font-semibold leading-tight text-[var(--ms-label)]", zoom >= 0.65 ? "line-clamp-2 text-[13px]" : "truncate text-[12px]")}>
                    {lane.title}
                  </div>
                  {zoom >= 0.65 && <div className="mt-0.5 truncate text-[11px] text-[var(--ms-label-3)]">{lane.subtitle}</div>}
                  {lane.critical > 0 && zoom >= 0.8 && (
                    <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--ms-critical-fill)] px-1.5 py-[2px] text-[10px] font-semibold text-[var(--ms-critical-text)]">
                      {lane.critical} critical
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Canvas — scaled as one layer so zoom is a single compositor transform */}
            <div className="relative shrink-0 overflow-hidden" style={{ width: canvasW * zoom, height: canvasH * zoom }}>
              <div
                ref={canvasRef}
                className="ms-canvas absolute left-0 top-0 origin-top-left"
                data-filter={matches ? "" : undefined}
                style={{ width: layout.width, height: canvasH, transform: `scale(${zoom}) translateX(${-LANE_W}px)` }}
                onPointerOver={onPointerOver}
                onPointerLeave={onPointerLeave}
                onClick={onClick}
              >
                <LaneBands lanes={layout.lanes} width={layout.width} />
                <SlackLayer cards={shownCards} />
                <EdgeLayer edges={shownEdges} width={layout.width} height={canvasH} />
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
        <span className="flex items-center gap-1.5"><span className="flex w-4 items-center"><span className="h-[2px] flex-1 bg-[repeating-linear-gradient(90deg,var(--ms-sep-strong)_0_3px,transparent_3px_5px)]" /><span className="h-[6px] w-[2px] rounded-full bg-[var(--ms-sep-strong)]" /></span>Slack</span>
        <span className="flex items-center gap-1.5"><span className="rounded-full bg-[var(--ms-cross-fill)] px-1 text-[10px] font-semibold text-[var(--ms-cross-text)]">⇄</span>Blocks other teams</span>
      </div>

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
