"use client";

import { useMemo } from "react";
import {
  ChartColumn,
  CirclePlay,
  CircleDashed,
  Flame,
  Hand,
  Hourglass,
  Layers,
  Lightbulb,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import {
  blockingOtherTeams,
  filterItems,
  levelTitle,
  linkedTeams,
  loadInsight,
  plural,
  sortEpics,
  sortTeams,
  waitingOnOtherTeams,
} from "@/lib/milestoneInsights";
import type { TeamSummary, WorkItem } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { Card, EmptyState, ProgressBar, SectionHeader, percentDone } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";
import { TeamDependencyPanel } from "./InsightPanels";
import { EpicRow, WorkItemRow } from "./MilestoneRows";

// Team load after the mac app's TeamLoadView: where one team's work piles up
// on a step while another's is empty is where work can be redistributed.

/** Gridline values for a 0…max axis: whole items, at most four lines. */
function axisTicks(max: number): { top: number; ticks: number[] } {
  const raw = Math.max(1, max) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw);
  const top = Math.max(step, Math.ceil(Math.max(1, max) / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

/**
 * Remaining items per step, critical stacked under the rest. `max` fixes the
 * y-axis top so cards side by side share one scale; red stays the only
 * critical colour while the rest wears the team's colour.
 */
export function TeamLoadChart({ team, length, max, color, height = 130 }: { team: TeamSummary; length: number; max?: number; color?: string; height?: number }) {
  const columns = Math.max(1, length, team.loadByLevel.length);
  const { top, ticks } = axisTicks(max ?? Math.max(1, ...team.loadByLevel));
  const labelEvery = columns <= 12 ? 1 : Math.ceil(columns / 12);
  const other = color ? `color-mix(in srgb, ${color} 62%, var(--ms-surface))` : "var(--ms-fill)";
  return (
    <figure
      className="m-0"
      role="img"
      aria-label={`${team.name}: remaining items by step — ${team.loadByLevel.map((n, i) => `${levelTitle(i)} ${n}`).join(", ")}`}
    >
      <div className="flex" style={{ height }}>
        <div className="relative w-7 shrink-0 text-[10px] tabular-nums text-[var(--ms-label-3)]" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-1.5 translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1 border-b border-[var(--ms-sep-strong)]">
          {ticks.slice(1).map((t) => (
            <div key={t} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-[var(--ms-sep)]" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] px-[2px]">
            {Array.from({ length: columns }, (_, level) => {
              const total = team.loadByLevel[level] ?? 0;
              const crit = team.criticalByLevel[level] ?? 0;
              return (
                <div
                  key={level}
                  className="ms-bar group relative flex h-full min-w-[3px] flex-1 flex-col justify-end"
                  title={`${levelTitle(level)}: ${plural(total, "item")}${crit ? `, ${crit} on the critical path` : ""}`}
                >
                  <div className="flex flex-col overflow-hidden rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: `${(total / top) * 100}%` }}>
                    <div style={{ flex: `${total - crit} 1 0`, background: other }} />
                    {crit > 0 && <div style={{ flex: `${crit} 1 0`, background: "var(--ms-critical)" }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-7 flex gap-[3px] px-[2px] pt-1 text-[10px] tabular-nums text-[var(--ms-label-3)]" aria-hidden="true">
        {Array.from({ length: columns }, (_, level) => (
          <span key={level} className="min-w-[3px] flex-1 overflow-visible whitespace-nowrap text-center">
            {level % labelEvery === 0 ? (level === 0 ? "Now" : level + 1) : ""}
          </span>
        ))}
      </div>
      <figcaption className="ml-7 mt-0.5 flex justify-between text-[10px] font-medium text-[var(--ms-label-3)]" aria-hidden="true">
        <span>Items</span>
        <span>Step</span>
      </figcaption>
    </figure>
  );
}

export function TeamLoadLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-3.5 text-[11.5px] text-[var(--ms-label-2)]", className)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--ms-critical)]" aria-hidden="true" /> Critical path
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-[linear-gradient(135deg,#0a84ff_0_33%,#00c7be_33%_66%,#ff9500_66%)] opacity-70" aria-hidden="true" />
        Other work, in the team’s colour
      </span>
    </div>
  );
}

export function TeamMetrics({ team }: { team: TeamSummary }) {
  const metrics: Array<{ label: string; value: number; icon: React.ReactNode; tint: string; help: string }> = [
    { label: "Remaining", value: team.remaining, icon: <CircleDashed size={14} />, tint: "var(--ms-label-3)", help: `Items in ${team.name} not done yet` },
    { label: "Critical", value: team.criticalItems, icon: <Flame size={14} className="fill-current" />, tint: "var(--ms-critical)", help: "Remaining items with no slack — any delay moves the milestone" },
    { label: "Ready", value: team.readyNow, icon: <CirclePlay size={14} />, tint: "var(--ms-ready)", help: "Not started and every blocker is done" },
    {
      label: "Unassigned",
      value: team.unassignedRemaining,
      icon: <UserRoundX size={14} />,
      tint: team.unassignedRemaining > 0 ? "var(--ms-warn)" : "var(--ms-label-3)",
      help: "Remaining items nobody owns yet",
    },
    {
      label: "Waiting on others",
      value: team.waitingOnOtherTeams,
      icon: <Hourglass size={14} />,
      tint: "var(--ms-label-3)",
      help: `Remaining items in ${team.name} blocked by another team’s remaining work`,
    },
    {
      label: "Blocking others",
      value: team.blockingOtherTeams,
      icon: <Hand size={14} />,
      tint: team.blockingOtherTeams > 0 ? "var(--ms-critical)" : "var(--ms-label-3)",
      help: `Remaining items in other teams blocked by ${team.name}’s remaining work`,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
      {metrics.map((m) => (
        <div key={m.label} className="flex min-w-0 items-center gap-1.5" title={m.help}>
          <span className="flex w-4 shrink-0 justify-center" style={{ color: m.tint }} aria-hidden="true">
            {m.icon}
          </span>
          <dd className="text-[13.5px] font-semibold tabular-nums text-[var(--ms-label)]">{m.value}</dd>
          <dt className="min-w-0 truncate text-[11.5px] text-[var(--ms-label-2)]">{m.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Insight({ team }: { team: TeamSummary }) {
  const text = loadInsight(team);
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--ms-label-2)]">
      <Lightbulb size={13} className="mt-px shrink-0 text-[var(--ms-warn)]" aria-hidden="true" />
      {text}
    </p>
  );
}

function TeamLoadCard({ team, max }: { team: TeamSummary; max: number }) {
  const { detail, colors, showTeam } = useMilestone();
  const color = colors.get(team.name);
  return (
    <button
      type="button"
      onClick={() => showTeam(team.name)}
      title={`Show ${team.name}`}
      className="ms-hover-card flex flex-col gap-3 rounded-2xl bg-[var(--ms-surface)] p-4 text-left shadow-[var(--ms-shadow-card)]"
    >
      <div className="flex w-full items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <span className="truncate text-[14px] font-semibold text-[var(--ms-label)]">{team.name}</span>
        <span className="shrink-0 text-[11.5px] text-[var(--ms-label-3)]">{plural(team.epicKeys.length, "epic")}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <ProgressBar progress={team.progress} className="w-[90px]" />
          <span className="w-9 text-right text-[11.5px] tabular-nums text-[var(--ms-label-2)]">{percentDone(team.progress)}%</span>
        </span>
      </div>
      <TeamLoadChart team={team} length={detail.criticalPath.length} max={max} color={color} />
      <TeamMetrics team={team} />
      <Insight team={team} />
    </button>
  );
}

export function TeamLoadTab({ matches, empty }: { matches: Set<string> | null; empty: React.ReactNode }) {
  const { detail } = useMilestone();
  // A team stays when any of its work matches — "team:checkout", a person, or an `is:` filter all narrow it.
  const teams = useMemo(
    () => sortTeams(matches ? detail.teams.filter((t) => detail.items.some((i) => i.team === t.name && matches.has(i.key))) : detail.teams),
    [detail, matches],
  );
  if (detail.teams.length > 0 && teams.length === 0) return empty;
  if (teams.length === 0) {
    return (
      <EmptyState
        icon={<UsersRound size={40} strokeWidth={1.4} />}
        title="No teams yet"
        message="No team epics implement this milestone’s increments."
      />
    );
  }
  const max = Math.max(1, ...detail.teams.flatMap((t) => t.loadByLevel));
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-2xl text-[13px] text-[var(--ms-label-2)]">
          Remaining items per step of the schedule, on one scale so teams compare directly. A tall bar next to an idle team is a candidate to rebalance.
        </p>
        <TeamLoadLegend />
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr))]">
        {teams.map((t) => (
          <TeamLoadCard key={t.name} team={t} max={max} />
        ))}
      </div>
      <TeamDependencyPanel />
    </div>
  );
}

function ItemSection({ title, icon, items, crossTeam, total }: { title: string; icon: React.ReactNode; items: WorkItem[]; crossTeam?: boolean; total: number }) {
  const { index } = useMilestone();
  return (
    <Card className="flex flex-col gap-2">
      <SectionHeader title={title} icon={icon} count={items.length} />
      {items.length === 0 ? (
        <p className="px-1 py-1 text-[13px] text-[var(--ms-label-3)]">{total > 0 ? "No matches." : "None"}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((item) => (
            <WorkItemRow key={item.key} item={item} showTeam={false} crossTeams={crossTeam ? linkedTeams(item, index.items) : undefined} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One team within a milestone: its load, who it holds up, who holds it up, its epics. */
export function TeamPageView({ teamName, matches }: { teamName: string; matches: Set<string> | null }) {
  const { detail, index, colors } = useMilestone();
  const team = index.teams.get(teamName);
  const lists = useMemo(() => {
    const blocking = blockingOtherTeams(detail, teamName);
    const waiting = waitingOnOtherTeams(detail, teamName);
    const ready = detail.readyNow.map((k) => index.items.get(k)).filter((i): i is WorkItem => !!i && i.team === teamName);
    return { blocking, waiting, ready };
  }, [detail, index, teamName]);
  if (!team) {
    return (
      <EmptyState
        icon={<UsersRound size={40} strokeWidth={1.4} />}
        title="Team not in this milestone"
        message={`${teamName} has no epics implementing ${detail.release.name}.`}
      />
    );
  }
  const color = colors.get(team.name);
  const epics = sortEpics(team.epicKeys.map((k) => index.epics.get(k)).filter((e): e is NonNullable<typeof e> => !!e));
  const shownEpics = matches ? epics.filter((e) => e.itemKeys.some((k) => matches.has(k)) || matches.has(e.key)) : epics;
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <UsersRound size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.02em] text-[var(--ms-label)]">{team.name}</h1>
          <p className="text-[13px] text-[var(--ms-label-2)]">
            {detail.release.name} · {plural(team.epicKeys.length, "epic")} · {team.remaining} remaining · {percentDone(team.progress)}% done
          </p>
        </div>
      </header>
      <Card className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title="Load by step" icon={<ChartColumn size={15} />} />
          <TeamLoadLegend />
        </div>
        <TeamLoadChart team={team} length={detail.criticalPath.length} color={color} height={200} />
        <TeamMetrics team={team} />
        <Insight team={team} />
      </Card>
      <ItemSection title="Blocking other teams" icon={<Hand size={15} />} items={filterItems(lists.blocking, matches)} total={lists.blocking.length} crossTeam />
      <ItemSection title="Waiting on other teams" icon={<Hourglass size={15} />} items={filterItems(lists.waiting, matches)} total={lists.waiting.length} crossTeam />
      <Card className="flex flex-col gap-2">
        <SectionHeader title="Epics" icon={<Layers size={15} />} count={shownEpics.length} hint="Critical first, then by when their work can start" />
        {shownEpics.length === 0 ? (
          <p className="px-1 py-1 text-[13px] text-[var(--ms-label-3)]">{epics.length ? "No matches." : "None"}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {shownEpics.map((e) => (
              <EpicRow key={e.key} epic={e} />
            ))}
          </ul>
        )}
      </Card>
      <ItemSection title="Ready now" icon={<CirclePlay size={15} />} items={filterItems(lists.ready, matches)} total={lists.ready.length} />
    </div>
  );
}
