"use client";

import { ArrowLeftRight, Route, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamMatrix } from "@/lib/milestoneView";
import { AssigneeLabel, Card, SectionHeader, StatusDot } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";
import { Team } from "./MilestoneRows";

// Web-only panels the mac app doesn't have: the critical chain step by step
// (on the Blockers tab) and the team × team "who waits on whom" matrix (on
// Team load).

/**
 * The representative longest chain, step by step, with who owns each step.
 * Handoffs between teams are where a milestone usually slips, so they're
 * called out.
 */
export function CriticalChainPanel() {
  const { detail, index, inspect, selectedKey } = useMilestone();
  const chain = detail.criticalPath.keys.map((k) => index.items.get(k)).filter((i): i is NonNullable<typeof i> => !!i);
  const handoffs = chain.filter((item, i) => i > 0 && chain[i - 1]?.team !== item.team).length;
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader
        title="Critical chain"
        icon={<Route size={15} />}
        hint={chain.length ? `${chain.length} steps · ${handoffs} handoff${handoffs === 1 ? "" : "s"}` : undefined}
      />
      {chain.length === 0 ? (
        <p className="text-[13px] text-[var(--ms-label-3)]">No remaining chain — everything is done.</p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {chain.map((item, i) => {
            const handoff = i > 0 && chain[i - 1]?.team !== item.team;
            const selected = selectedKey === item.key;
            return (
              <li key={item.key}>
                {handoff && (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-[var(--ms-cross-text)]">
                    <ArrowLeftRight size={11} aria-hidden="true" /> Handoff to {item.team}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => inspect(item.key)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    selected ? "bg-[color-mix(in_srgb,var(--ms-accent)_15%,transparent)]" : "hover:bg-[var(--ms-fill-2)]",
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ms-critical-fill)] text-[10.5px] font-semibold tabular-nums text-[var(--ms-critical-text)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <StatusDot status={item.status} className="h-1.5 w-1.5" />
                      <span className="truncate text-[13px] text-[var(--ms-label)]">{item.summary}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[var(--ms-label-3)]">
                      {item.key}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Team team={item.team} />
                    <AssigneeLabel name={item.assignee} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Team × team grid of open cross-team links: rows block, columns wait. */
export function TeamDependencyPanel() {
  const { detail, colors, showTeam } = useMilestone();
  const matrix = teamMatrix(detail);
  if (!matrix) return null;
  const { teams, counts, max } = matrix;
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader title="Who waits on whom" icon={<UsersRound size={15} />} hint="Open cross-team links · row blocks column" />
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-[12px]">
          <thead>
            <tr>
              <th className="w-28 text-left text-[11px] font-medium text-[var(--ms-label-3)]">
                <span className="sr-only">Blocking team</span>
              </th>
              {teams.map((t) => (
                <th key={t} scope="col" className="px-1 pb-1 text-center text-[11px] font-medium text-[var(--ms-label-2)]">
                  <span className="mx-auto flex max-w-[88px] items-center justify-center gap-1" title={`${t} waits`}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors.get(t) }} aria-hidden="true" />
                    <span className="truncate">{t}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((from) => (
              <tr key={from}>
                <th scope="row" className="truncate pr-2 text-left text-[12px] font-medium text-[var(--ms-label)]">
                  <button
                    type="button"
                    onClick={() => showTeam(from)}
                    title={`Show ${from}`}
                    className="flex items-center gap-1.5 rounded text-left hover:text-[var(--ms-accent-text)]"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(from) }} aria-hidden="true" />
                    {from}
                  </button>
                </th>
                {teams.map((to) => {
                  const n = counts[from]?.[to] ?? 0;
                  const self = from === to;
                  return (
                    <td
                      key={to}
                      title={self ? undefined : `${from} blocks ${to}: ${n} open link${n === 1 ? "" : "s"}`}
                      className={cn(
                        "h-9 min-w-9 rounded-md text-center font-semibold tabular-nums",
                        self ? "bg-transparent" : n ? "text-[var(--ms-label)]" : "bg-[var(--ms-fill-2)] text-[var(--ms-label-3)]",
                      )}
                      style={
                        !self && n
                          ? { background: `color-mix(in srgb, var(--ms-cross) ${Math.round(14 + (n / max) * 56)}%, transparent)` }
                          : undefined
                      }
                    >
                      {self ? "" : n || "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
