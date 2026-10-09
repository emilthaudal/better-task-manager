"use client";

import { cn } from "@/lib/utils";
import type { MilestoneDetail, MilestoneWarning, TeamSummary } from "@/lib/milestoneTypes";
import { Avatar, Badge, KeyChip, ProgressBar, SectionTitle, StatusDot, Surface, percentDone } from "./MilestoneBits";

type Select = (key: string) => void;

// ── Critical chain ──────────────────────────────────────────────────────────

/**
 * The representative longest chain, step by step, with who owns each step.
 * Handoffs between teams are where a milestone usually slips, so they're
 * called out.
 */
export function CriticalChainPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  const byKey = new Map(detail.items.map((i) => [i.key, i]));
  const chain = detail.criticalPath.keys.map((k) => byKey.get(k)).filter((i): i is NonNullable<typeof i> => !!i);
  const handoffs = chain.filter((item, i) => i > 0 && chain[i - 1]?.team !== item.team).length;
  return (
    <section aria-labelledby="ms-chain">
      <SectionTitle hint={chain.length ? `${chain.length} steps · ${handoffs} team handoff${handoffs === 1 ? "" : "s"}` : undefined}>
        <span id="ms-chain">Critical path</span>
      </SectionTitle>
      {chain.length === 0 ? (
        <Surface className="px-4 py-6 text-center text-[13px] text-[var(--ms-label-2)]">No remaining chain — everything is done.</Surface>
      ) : (
        <Surface>
          <ol className="relative">
            {chain.map((item, i) => {
              const handoff = i > 0 && chain[i - 1]?.team !== item.team;
              return (
                <li key={item.key} className="relative">
                  {handoff && (
                    <div className="flex items-center gap-2 border-t border-[var(--ms-sep)] bg-[var(--ms-cross-fill)] px-4 py-1 text-[11px] font-semibold text-[var(--ms-cross-text)]">
                      <span aria-hidden="true">⇄</span> Handoff to {item.team}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(item.key)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--ms-fill-2)]",
                      i > 0 && !handoff && "border-t border-[var(--ms-sep)]",
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ms-critical-fill)] text-[11px] font-semibold tabular-nums text-[var(--ms-critical-text)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusDot status={item.status} />
                        <span className="truncate text-[13.5px] font-medium text-[var(--ms-label)]">{item.summary}</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--ms-label-3)]">
                        <span className="font-mono">{item.key}</span> · {item.team}
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--ms-label-2)]">
                      <Avatar name={item.assignee} size={16} />
                      {item.assignee ?? <span className="font-medium text-[var(--ms-warn-text)]">Unassigned</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Surface>
      )}
    </section>
  );
}

// ── Blocker epics ───────────────────────────────────────────────────────────

export function BlockerEpicsPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  const epicByKey = new Map(detail.epics.map((e) => [e.key, e]));
  const critical = new Set(detail.criticalPath.criticalKeys);
  const maxGated = Math.max(1, ...detail.blockerEpics.map((b) => b.downstreamItems));
  return (
    <section aria-labelledby="ms-blockers">
      <SectionTitle hint="Epics whose remaining work others wait on — most impactful first">
        <span id="ms-blockers">Blocker epics</span>
      </SectionTitle>
      {detail.blockerEpics.length === 0 ? (
        <Surface className="px-4 py-6 text-center text-[13px] text-[var(--ms-label-2)]">
          No epic is blocking another epic’s remaining work.
        </Surface>
      ) : (
        <Surface>
          <ol className="divide-y divide-[var(--ms-sep)]">
            {detail.blockerEpics.map((b, i) => {
              const epic = epicByKey.get(b.epicKey);
              return (
                <li key={b.epicKey} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(b.epicKey)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ms-fill-2)]"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
                        b.onCriticalPath ? "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]" : "bg-[var(--ms-fill)] text-[var(--ms-label-2)]",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-[var(--ms-label)]">{epic?.summary ?? b.epicKey}</span>
                        {b.onCriticalPath && <Badge tone="critical">Critical path</Badge>}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-[var(--ms-label-2)]">
                        <span className="font-mono text-[11px] text-[var(--ms-label-3)]">{b.epicKey}</span> · {b.team} · {b.remaining} remaining
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ms-fill)]">
                          <div
                            className={cn("h-full rounded-full", b.onCriticalPath ? "bg-[var(--ms-critical)]" : "bg-[var(--ms-cross)]")}
                            style={{ width: `${(b.downstreamItems / maxGated) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[12px] tabular-nums text-[var(--ms-label-2)]">
                          gates <span className="font-semibold text-[var(--ms-label)]">{b.downstreamItems}</span> item{b.downstreamItems === 1 ? "" : "s"}
                        </span>
                      </div>
                      {b.blockedTeams.length > 0 && (
                        <div className="mt-1.5 text-[12px] text-[var(--ms-label-2)]">
                          Holds up <span className="font-semibold text-[var(--ms-cross-text)]">{b.blockedTeams.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-1 px-4 pb-3 pl-[52px] text-[12px] text-[var(--ms-label-3)]">
                    <span className="mr-0.5">Blocks</span>
                    {b.blockedEpics.map((k) => (
                      <KeyChip key={k} issueKey={k} onClick={onSelect} />
                    ))}
                    {b.gatingItems.length > 0 && <span className="ml-2 mr-0.5">via</span>}
                    {b.gatingItems.map((k) => (
                      <KeyChip key={k} issueKey={k} onClick={onSelect} critical={critical.has(k)} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Surface>
      )}
    </section>
  );
}

// ── Team load ───────────────────────────────────────────────────────────────

function LoadBars({ team, columns }: { team: TeamSummary; columns: number }) {
  const max = Math.max(1, ...team.loadByLevel);
  return (
    <div className="flex h-12 items-end gap-[3px]" role="img" aria-label={`Remaining items per step: ${team.loadByLevel.join(", ")}`}>
      {Array.from({ length: columns }, (_, level) => {
        const total = team.loadByLevel[level] ?? 0;
        const crit = team.criticalByLevel[level] ?? 0;
        return (
          <div
            key={level}
            className="flex h-full min-w-[3px] flex-1 flex-col-reverse overflow-hidden rounded-[3px] bg-[var(--ms-fill-2)]"
            title={`${level === 0 ? "Now" : `Step ${level + 1}`}: ${total} item${total === 1 ? "" : "s"}${crit ? ` (${crit} critical)` : ""}`}
          >
            <div className="bg-[var(--ms-critical)]" style={{ height: `${(crit / max) * 100}%` }} />
            <div className="bg-[var(--ms-accent)] opacity-60" style={{ height: `${((total - crit) / max) * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export function TeamLoadPanel({ detail }: { detail: MilestoneDetail }) {
  const columns = Math.max(1, detail.criticalPath.length);
  const teams = detail.teams.filter((t) => t.remaining > 0 || t.progress.total > 0);
  return (
    <section aria-labelledby="ms-teams">
      <SectionTitle hint="Remaining items per step · red is critical path">
        <span id="ms-teams">Teams</span>
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <Surface key={t.name} className="flex flex-col p-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="truncate text-[14px] font-semibold text-[var(--ms-label)]">{t.name}</h3>
              <span className="text-[12px] tabular-nums text-[var(--ms-label-2)]">{percentDone(t.progress)}% done</span>
            </div>
            <ProgressBar progress={t.progress} className="mb-3" />
            <LoadBars team={t} columns={columns} />
            <dl className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2 text-[12px]">
              {(
                [
                  ["Remaining", t.remaining, undefined],
                  ["Critical", t.criticalItems, "critical"],
                  ["Ready now", t.readyNow, "ready"],
                  ["Unassigned", t.unassignedRemaining, "warn"],
                  ["Waiting on others", t.waitingOnOtherTeams, undefined],
                  ["Blocking others", t.blockingOtherTeams, "cross"],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-[11px] text-[var(--ms-label-3)]">{label}</dt>
                  <dd
                    className={cn(
                      "text-[15px] font-semibold tabular-nums text-[var(--ms-label)]",
                      value > 0 && tone === "critical" && "text-[var(--ms-critical-text)]",
                      value > 0 && tone === "ready" && "text-[var(--ms-ready-text)]",
                      value > 0 && tone === "warn" && "text-[var(--ms-warn-text)]",
                      value > 0 && tone === "cross" && "text-[var(--ms-cross-text)]",
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>
        ))}
      </div>
    </section>
  );
}

// ── Increments ──────────────────────────────────────────────────────────────

export function IncrementsPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  return (
    <section aria-labelledby="ms-increments">
      <SectionTitle hint="The LAD epics delivering this milestone">
        <span id="ms-increments">Increments</span>
      </SectionTitle>
      <Surface>
        <ul className="divide-y divide-[var(--ms-sep)]">
          {detail.increments.map((inc) => (
            <li key={inc.key}>
              <button
                type="button"
                onClick={() => onSelect(inc.key)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--ms-fill-2)]"
              >
                <div className="flex w-full items-center gap-2">
                  <StatusDot status={inc.status} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ms-label)]">{inc.summary}</span>
                  <span className="text-[12px] tabular-nums text-[var(--ms-label-2)]">{percentDone(inc.progress)}%</span>
                </div>
                <ProgressBar progress={inc.progress} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--ms-label-2)]">
                  <span className="font-mono text-[11px] text-[var(--ms-label-3)]">{inc.key}</span>
                  {inc.capabilities.map((c) => (
                    <span key={c.key}>{c.summary}</span>
                  ))}
                  <span>{inc.teamEpics.length} team epic{inc.teamEpics.length === 1 ? "" : "s"}</span>
                  {inc.criticalItems > 0 && <span className="text-[var(--ms-critical-text)]">{inc.criticalItems} critical</span>}
                  {inc.derivedBlockedBy.length > 0 && <span>waits on {inc.derivedBlockedBy.join(", ")}</span>}
                  {inc.derivedBlocks.length > 0 && <span>blocks {inc.derivedBlocks.join(", ")}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}

// ── Ready now + warnings ────────────────────────────────────────────────────

export function ReadyNowPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  const byKey = new Map(detail.items.map((i) => [i.key, i]));
  return (
    <section aria-labelledby="ms-ready">
      <SectionTitle hint="All blockers done — critical first">
        <span id="ms-ready">Ready to start</span>
      </SectionTitle>
      {detail.readyNow.length === 0 ? (
        <Surface className="px-4 py-6 text-center text-[13px] text-[var(--ms-label-2)]">Nothing is unblocked right now.</Surface>
      ) : (
        <Surface>
          <ul className="max-h-[420px] divide-y divide-[var(--ms-sep)] overflow-y-auto">
            {detail.readyNow.map((k) => {
              const item = byKey.get(k);
              if (!item) return null;
              const critical = !!item.schedule?.critical;
              return (
                <li key={k}>
                  <button type="button" onClick={() => onSelect(k)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--ms-fill-2)]">
                    <span className={cn("w-[68px] shrink-0 font-mono text-[11px]", critical ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]")}>{k}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{item.summary}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--ms-label-2)]">
                      <Avatar name={item.assignee} size={16} />
                      {item.assignee ?? <span className="text-[var(--ms-warn-text)]">Unassigned</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </section>
  );
}

const WARNING_LABEL: Record<MilestoneWarning["kind"], string> = {
  cycle: "Cycle",
  "undeclared-dependency": "Undeclared",
  "unbacked-dependency": "Unbacked",
  "out-of-order-dependency": "Out of order",
  "external-blocker": "External",
  "no-team-epics": "No team epics",
  unscheduled: "Unscheduled",
  "unassigned-critical": "Unassigned",
};

export function WarningsPanel({ warnings, onSelect }: { warnings: MilestoneWarning[]; onSelect: Select }) {
  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby="ms-warnings">
      <SectionTitle hint={`${warnings.length} sequencing issue${warnings.length === 1 ? "" : "s"}`}>
        <span id="ms-warnings">Needs attention</span>
      </SectionTitle>
      <Surface>
        <ul className="max-h-[360px] divide-y divide-[var(--ms-sep)] overflow-y-auto">
          {warnings.map((w, i) => (
            <li key={i} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-start gap-2">
                <Badge tone="warn">{WARNING_LABEL[w.kind]}</Badge>
                <span className="text-[13px] leading-snug text-[var(--ms-label)]">{w.message}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[...new Set(w.keys)].map((k) => (
                  <KeyChip key={k} issueKey={k} onClick={onSelect} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}
