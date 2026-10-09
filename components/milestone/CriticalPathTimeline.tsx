"use client";

import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  COLUMN_GAP,
  LANE_HEADER_WIDTH,
  chainOf,
  columnX,
  layoutTimeline,
} from "@/lib/milestoneLayout";
import type { LaneMode, LaidOutEdge } from "@/lib/milestoneLayout";
import type { MilestoneDetail, WorkItem } from "@/lib/milestoneTypes";
import { StatusDot } from "./MilestoneBits";

interface Props {
  detail: MilestoneDetail;
  laneMode: LaneMode;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

const COLUMN_HEADER_HEIGHT = 32;

function edgePath(e: LaidOutEdge): string {
  const dx = Math.max(24, (e.x2 - e.x1) / 2);
  return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
}

const Card = memo(function Card({
  item,
  x,
  y,
  dimmed,
  selected,
  onSelect,
  onHover,
}: {
  item: WorkItem;
  x: number;
  y: number;
  dimmed: boolean;
  selected: boolean;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const s = item.schedule;
  const critical = !!s?.critical;
  const crossTeam = (s?.downstreamTeams.length ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      onMouseEnter={() => onHover(item.key)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "absolute flex flex-col justify-between rounded-xl border bg-background px-3 py-2 text-left shadow-sm transition-all duration-150",
        critical ? "border-rose-500/60 shadow-rose-500/10" : "border-border",
        item.external && "border-dashed bg-amber-500/5",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        dimmed ? "opacity-25" : "hover:-translate-y-px hover:shadow-md",
      )}
      style={{ left: x, top: y + COLUMN_HEADER_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <div className="flex items-center gap-1.5">
        <StatusDot status={item.status} />
        <span className={cn("font-mono text-[11px] font-semibold", critical ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
          {item.key}
        </span>
        {item.external && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">outside</span>}
        <span className="ml-auto flex items-center gap-1">
          {crossTeam && (
            <span title={`Blocks ${s?.downstreamTeams.join(", ")}`} className="rounded bg-violet-500/10 px-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              ⇄ {s?.downstreamTeams.length}
            </span>
          )}
          {s?.ready ? (
            <span title="All blockers done" className="rounded bg-emerald-500/10 px-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ready
            </span>
          ) : null}
          {!critical && s && s.slack > 0 && (
            <span title={`Can slip ${s.slack} steps without delaying the milestone`} className="text-[10px] tabular-nums text-muted-foreground">
              +{s.slack}
            </span>
          )}
        </span>
      </div>
      <div className="line-clamp-2 text-[12px] leading-[1.25] text-foreground" title={item.summary}>
        {item.summary}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className={cn("truncate", !item.assignee && critical && "font-semibold text-amber-600 dark:text-amber-400")}>
          {item.assignee ?? "Unassigned"}
        </span>
        {s && s.downstream > 0 && <span className="tabular-nums">unblocks {s.downstream}</span>}
      </div>
    </button>
  );
});

export default function CriticalPathTimeline({ detail, laneMode, selectedKey, onSelect }: Props) {
  const layout = useMemo(() => layoutTimeline(detail, laneMode), [detail, laneMode]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const focusKey = hoverKey ?? selectedKey;
  const chain = useMemo(
    () => (focusKey ? chainOf(focusKey, detail.dependencies) : null),
    [focusKey, detail.dependencies],
  );

  if (layout.cards.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Everything in this milestone is done — no remaining critical path.
      </div>
    );
  }

  const height = layout.height + COLUMN_HEADER_HEIGHT;
  const slackBars = layout.cards.filter((c) => c.item.schedule && c.item.schedule.slack > 0);

  return (
    <div className="relative" style={{ width: layout.width, height }} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
      {/* Column headers — dependency levels */}
      {Array.from({ length: layout.columns }, (_, level) => (
        <div
          key={level}
          className="absolute top-0 flex h-8 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          style={{ left: columnX(level) - COLUMN_GAP / 2, width: CARD_WIDTH + COLUMN_GAP }}
        >
          {level === 0 ? "Now" : `Step ${level + 1}`}
        </div>
      ))}

      {/* Lanes */}
      {layout.lanes.map((lane, i) => (
        <div
          key={lane.id}
          className={cn("absolute left-0 border-t border-border", i % 2 === 1 && "bg-muted/40")}
          style={{ top: lane.y + COLUMN_HEADER_HEIGHT, height: lane.height, width: layout.width }}
        >
          <div className="sticky left-0 flex h-full flex-col justify-center bg-inherit px-4" style={{ width: LANE_HEADER_WIDTH }}>
            <div className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">{lane.title}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{lane.subtitle}</div>
            {lane.critical > 0 && (
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                {lane.critical} on critical path
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Slack: how far a card could slide right without delaying the milestone */}
      {slackBars.map((c) => (
        <div
          key={`slack-${c.item.key}`}
          className={cn("absolute rounded-xl border border-dashed border-border/80 transition-opacity", chain && !chain.has(c.item.key) && "opacity-25")}
          style={{
            left: c.x + CARD_WIDTH - 12,
            top: c.y + COLUMN_HEADER_HEIGHT + 6,
            height: CARD_HEIGHT - 12,
            width: (c.item.schedule?.slack ?? 0) * (CARD_WIDTH + COLUMN_GAP) + 12,
          }}
        />
      ))}

      {/* Dependencies */}
      <svg className="pointer-events-none absolute left-0" style={{ top: COLUMN_HEADER_HEIGHT }} width={layout.width} height={layout.height}>
        <defs>
          {["crit", "cross", "norm"].map((id) => (
            <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={id === "crit" ? "fill-rose-500" : id === "cross" ? "fill-violet-500" : "fill-slate-400"} />
            </marker>
          ))}
        </defs>
        {layout.edges.map((e) => {
          const d = e.dependency;
          const lit = !chain || (chain.has(d.from) && chain.has(d.to));
          const kind = d.critical ? "crit" : d.crossTeam ? "cross" : "norm";
          return (
            <path
              key={`${d.from}>${d.to}`}
              d={edgePath(e)}
              fill="none"
              markerEnd={`url(#arrow-${kind})`}
              strokeDasharray={d.kind === "epic" ? "5 4" : undefined}
              className={cn(
                "transition-opacity",
                kind === "crit" ? "stroke-rose-500" : kind === "cross" ? "stroke-violet-500" : "stroke-slate-400 dark:stroke-slate-500",
                lit ? "opacity-90" : "opacity-10",
              )}
              strokeWidth={d.critical ? 2.25 : 1.5}
            />
          );
        })}
      </svg>

      {layout.cards.map((c) => (
        <Card
          key={c.item.key}
          item={c.item}
          x={c.x}
          y={c.y}
          dimmed={!!chain && !chain.has(c.item.key)}
          selected={selectedKey === c.item.key}
          onSelect={onSelect}
          onHover={setHoverKey}
        />
      ))}
    </div>
  );
}
