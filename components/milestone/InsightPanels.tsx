"use client";

import { cn } from "@/lib/utils";
import type { MilestoneDetail, MilestoneWarning, TeamSummary } from "@/lib/milestoneTypes";
import { KeyChip, ProgressBar, SectionTitle, StatusDot, percentDone } from "./MilestoneBits";

type Select = (key: string) => void;

// ── Blocker epics ───────────────────────────────────────────────────────────

export function BlockerEpicsPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  const epicByKey = new Map(detail.epics.map((e) => [e.key, e]));
  const critical = new Set(detail.criticalPath.criticalKeys);
  return (
    <section>
      <SectionTitle hint="remaining work other epics wait on — most impactful first">Blocker epics</SectionTitle>
      {detail.blockerEpics.length === 0 ? (
        <p className="text-sm text-muted-foreground">No epic is blocking another epic&apos;s remaining work.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {detail.blockerEpics.map((b, i) => {
            const epic = epicByKey.get(b.epicKey);
            return (
              <li
                key={b.epicKey}
                className={cn(
                  "rounded-xl border bg-background p-3 shadow-sm",
                  b.onCriticalPath ? "border-rose-500/40" : "border-border",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <KeyChip issueKey={b.epicKey} onClick={onSelect} critical={b.onCriticalPath} />
                      <span className="truncate text-sm font-medium text-foreground">{epic?.summary}</span>
                      {b.onCriticalPath && (
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                          Critical path
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {b.team} · {b.remaining} remaining · gates {b.downstreamItems} items in {b.blockedEpics.length} epic
                      {b.blockedEpics.length === 1 ? "" : "s"}
                      {b.blockedTeams.length > 0 && (
                        <span className="font-semibold text-violet-600 dark:text-violet-400"> across {b.blockedTeams.join(", ")}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Blocks</span>
                      {b.blockedEpics.map((k) => (
                        <KeyChip key={k} issueKey={k} onClick={onSelect} />
                      ))}
                      <span className="ml-2">via</span>
                      {b.gatingItems.map((k) => (
                        <KeyChip key={k} issueKey={k} onClick={onSelect} critical={critical.has(k)} />
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── Team load ───────────────────────────────────────────────────────────────

function LoadBars({ team, columns }: { team: TeamSummary; columns: number }) {
  const max = Math.max(1, ...team.loadByLevel);
  return (
    <div className="flex h-12 items-end gap-0.5" aria-label="Remaining items by step">
      {Array.from({ length: columns }, (_, level) => {
        const total = team.loadByLevel[level] ?? 0;
        const crit = team.criticalByLevel[level] ?? 0;
        return (
          <div
            key={level}
            className="flex flex-1 flex-col-reverse overflow-hidden rounded-sm bg-muted"
            style={{ height: "100%" }}
            title={`${level === 0 ? "Now" : `Step ${level + 1}`}: ${total} items (${crit} critical)`}
          >
            <div className="bg-rose-500" style={{ height: `${(crit / max) * 100}%` }} />
            <div className="bg-[var(--status-progress)]/70" style={{ height: `${((total - crit) / max) * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export function TeamLoadPanel({ detail }: { detail: MilestoneDetail }) {
  const columns = Math.max(1, detail.criticalPath.length);
  return (
    <section>
      <SectionTitle hint="remaining items per step · red = critical path">Team load</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {detail.teams
          .filter((t) => t.remaining > 0 || t.progress.total > 0)
          .map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-background p-4 shadow-sm">
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">{percentDone(t.progress)}% done</span>
              </div>
              <ProgressBar progress={t.progress} className="mb-3" />
              <LoadBars team={t} columns={columns} />
              <dl className="mt-3 grid grid-cols-3 gap-y-1 text-xs">
                {[
                  ["Remaining", t.remaining],
                  ["Critical", t.criticalItems],
                  ["Ready now", t.readyNow],
                  ["Unassigned", t.unassignedRemaining],
                  ["Waiting on others", t.waitingOnOtherTeams],
                  ["Blocking others", t.blockingOtherTeams],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex flex-col">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd
                      className={cn(
                        "font-semibold tabular-nums text-foreground",
                        label === "Critical" && Number(value) > 0 && "text-rose-600 dark:text-rose-400",
                        label === "Blocking others" && Number(value) > 0 && "text-violet-600 dark:text-violet-400",
                      )}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
      </div>
    </section>
  );
}

// ── Increments ──────────────────────────────────────────────────────────────

export function IncrementsPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  return (
    <section>
      <SectionTitle hint="the LAD epics delivering this milestone">Increments</SectionTitle>
      <div className="flex flex-col gap-2">
        {detail.increments.map((inc) => (
          <button
            type="button"
            key={inc.key}
            onClick={() => onSelect(inc.key)}
            className="rounded-xl border border-border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-center gap-2">
              <StatusDot status={inc.status} />
              <KeyChip issueKey={inc.key} critical={inc.criticalItems > 0} />
              <span className="flex-1 truncate text-sm font-medium text-foreground">{inc.summary}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{percentDone(inc.progress)}%</span>
            </div>
            <ProgressBar progress={inc.progress} className="my-2" />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {inc.capabilities.map((c) => (
                <span key={c.key}>
                  <span className="font-mono">{c.key}</span> {c.summary}
                </span>
              ))}
              <span>{inc.teamEpics.length} team epics</span>
              {inc.criticalItems > 0 && <span className="text-rose-600 dark:text-rose-400">{inc.criticalItems} critical</span>}
              {inc.derivedBlockedBy.length > 0 && <span>waits on {inc.derivedBlockedBy.join(", ")}</span>}
              {inc.derivedBlocks.length > 0 && <span>blocks {inc.derivedBlocks.join(", ")}</span>}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Ready now + warnings ────────────────────────────────────────────────────

export function ReadyNowPanel({ detail, onSelect }: { detail: MilestoneDetail; onSelect: Select }) {
  const byKey = new Map(detail.items.map((i) => [i.key, i]));
  return (
    <section>
      <SectionTitle hint="all blockers done — critical first">Ready to start</SectionTitle>
      {detail.readyNow.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is unblocked right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background shadow-sm">
          {detail.readyNow.map((k) => {
            const item = byKey.get(k);
            if (!item) return null;
            return (
              <li key={k}>
                <button type="button" onClick={() => onSelect(k)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
                  <KeyChip issueKey={k} critical={item.schedule?.critical} />
                  <span className="flex-1 truncate text-sm text-foreground">{item.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.assignee ?? <span className="text-amber-600 dark:text-amber-400">Unassigned</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
    <section>
      <SectionTitle>Attention</SectionTitle>
      <ul className="flex flex-col gap-2">
        {warnings.map((w, i) => (
          <li key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {WARNING_LABEL[w.kind]}
              </span>
              <span className="text-foreground">{w.message}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[...new Set(w.keys)].map((k) => (
                <KeyChip key={k} issueKey={k} onClick={onSelect} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
