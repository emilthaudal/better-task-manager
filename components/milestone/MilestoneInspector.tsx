"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ItemSchedule, MilestoneDetail, StatusRef } from "@/lib/milestoneTypes";
import { Avatar, Badge, KeyChip, ProgressBar, StatusDot, StatusPill, percentDone } from "./MilestoneBits";

interface Props {
  detail: MilestoneDetail;
  selectedKey: string;
  jiraBaseUrl: string;
  onSelect: (key: string | null) => void;
  /** Offered when the timeline isn't showing — switches to it with this selection. */
  onShowInTimeline?: () => void;
}

interface Ref {
  key: string;
  summary: string;
  status: StatusRef | null;
  critical: boolean;
  team: string | null;
}

function describeSchedule(s: ItemSchedule): string {
  const start = s.earliestStart === 0 ? "Can start now" : `Can start at step ${s.earliestStart + 1}`;
  if (s.critical) return `${start}. On the critical path — any delay moves the milestone.`;
  return `${start}. ${s.slack} step${s.slack === 1 ? "" : "s"} of slack before it delays the milestone.`;
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-label-3)]">
        {title}
        {count !== undefined && count > 0 && <span className="tabular-nums">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function IssueRows({ refs, onSelect, empty = "None" }: { refs: Ref[]; onSelect: (k: string) => void; empty?: string }) {
  if (refs.length === 0) return <p className="px-1 text-[13px] text-[var(--ms-label-3)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--ms-sep)] overflow-hidden rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]">
      {refs.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onSelect(r.key)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--ms-fill-2)]"
          >
            {r.status && <StatusDot status={r.status} />}
            <span className={cn("shrink-0 font-mono text-[11px]", r.critical ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]")}>
              {r.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{r.summary}</span>
            {r.team && <span className="shrink-0 text-[11px] text-[var(--ms-label-3)]">{r.team}</span>}
            <span aria-hidden="true" className="text-[var(--ms-label-3)]">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
      <span className="text-[var(--ms-label-2)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--ms-label)]">{children}</span>
    </div>
  );
}

export default function MilestoneInspector({ detail, selectedKey, jiraBaseUrl, onSelect, onShowInTimeline }: Props) {
  const index = useMemo(() => {
    const critical = new Set(detail.criticalPath.criticalKeys);
    const refs = new Map<string, Ref>();
    for (const inc of detail.increments) refs.set(inc.key, { key: inc.key, summary: inc.summary, status: inc.status, critical: inc.criticalItems > 0, team: null });
    for (const e of detail.epics) refs.set(e.key, { key: e.key, summary: e.summary, status: e.status, critical: e.onCriticalPath, team: e.team });
    for (const i of detail.items) refs.set(i.key, { key: i.key, summary: i.summary, status: i.status, critical: critical.has(i.key), team: i.team });
    return refs;
  }, [detail]);
  const refsOf = (keys: string[]): Ref[] =>
    keys.map((k) => index.get(k) ?? { key: k, summary: "Not in this milestone", status: null, critical: false, team: null });

  const item = detail.items.find((i) => i.key === selectedKey);
  const epic = detail.epics.find((e) => e.key === selectedKey);
  const increment = detail.increments.find((i) => i.key === selectedKey);
  const self = index.get(selectedKey);
  const status = epic?.status ?? increment?.status ?? item?.status;
  const select = (k: string) => onSelect(k);

  return (
    <aside
      aria-label={`Details for ${selectedKey}`}
      className="ms-material ms-sheet-in absolute bottom-3 right-3 top-3 z-40 flex w-[380px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl"
    >
      <div className="flex items-start gap-3 border-b border-[var(--ms-sep)] px-5 pb-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <KeyChip issueKey={selectedKey} critical={self?.critical} />
            {status && <StatusPill status={status} />}
            {epic && <Badge>Team epic</Badge>}
            {increment && <Badge>Increment</Badge>}
            {item?.external && <Badge tone="warn">Outside milestone</Badge>}
          </div>
          <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[var(--ms-label)]">
            {self?.summary ?? "Not part of this milestone"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Close details (Esc)"
          title="Close (Esc)"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ms-fill)] text-[var(--ms-label-2)] transition-colors hover:bg-[var(--ms-sep-strong)] hover:text-[var(--ms-label)]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {item && (
          <>
            <div
              className={cn(
                "rounded-xl px-3.5 py-3 text-[13px] leading-snug",
                !item.schedule
                  ? "bg-[var(--ms-ready-fill)] text-[var(--ms-ready-text)]"
                  : item.schedule.critical
                    ? "bg-[var(--ms-critical-fill)] text-[var(--ms-critical-text)]"
                    : "bg-[var(--ms-fill-2)] text-[var(--ms-label)]",
              )}
            >
              <span className="font-medium">
                {item.schedule ? describeSchedule(item.schedule) : "Done — no longer constrains the milestone."}
              </span>
              {item.schedule && item.schedule.downstream > 0 && (
                <div className="mt-1 text-[var(--ms-label-2)]">
                  Unblocks {item.schedule.downstream} remaining item{item.schedule.downstream === 1 ? "" : "s"}
                  {item.schedule.downstreamTeams.length > 0 && (
                    <> in <span className="font-semibold text-[var(--ms-cross-text)]">{item.schedule.downstreamTeams.join(", ")}</span></>
                  )}
                  .
                </div>
              )}
            </div>
            <div className="divide-y divide-[var(--ms-sep)] rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]">
              <Fact label="Team">{item.team}</Fact>
              <Fact label="Assignee">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={item.assignee} size={18} />
                  {item.assignee ?? <span className="text-[var(--ms-warn-text)]">Unassigned</span>}
                </span>
              </Fact>
              {item.epicKey && (
                <Fact label="Epic">
                  <button type="button" className="text-[var(--ms-accent-text)] hover:underline" onClick={() => select(item.epicKey ?? "")}>
                    {index.get(item.epicKey)?.summary ?? item.epicKey}
                  </button>
                </Fact>
              )}
              <Fact label="Type">{item.type}{item.points !== null ? ` · ${item.points} pts` : ""}</Fact>
            </div>
            <Section title="Waits on" count={item.blockedBy.length}>
              <IssueRows refs={refsOf(item.blockedBy)} onSelect={select} empty="Nothing — no blockers." />
            </Section>
            <Section title="Blocks" count={item.blocks.length}>
              <IssueRows refs={refsOf(item.blocks)} onSelect={select} empty="Nothing waits on this." />
            </Section>
          </>
        )}

        {epic && (
          <>
            <div className="rounded-xl bg-[var(--ms-surface)] px-3.5 py-3 shadow-[var(--ms-shadow-card)]">
              <div className="mb-2 flex items-baseline justify-between text-[13px]">
                <span className="font-medium text-[var(--ms-label)]">{epic.team}</span>
                <span className="tabular-nums text-[var(--ms-label-2)]">
                  {epic.progress.done}/{epic.progress.total} done · {percentDone(epic.progress)}%
                </span>
              </div>
              <ProgressBar progress={epic.progress} />
              {epic.criticalItems > 0 && (
                <div className="mt-2 text-[12px] font-medium text-[var(--ms-critical-text)]">{epic.criticalItems} item{epic.criticalItems === 1 ? "" : "s"} on the critical path</div>
              )}
            </div>
            <Section title="Waits on epics" count={epic.blockedByEpics.length}>
              <IssueRows refs={refsOf(epic.blockedByEpics)} onSelect={select} empty="No other epic." />
            </Section>
            <Section title="Blocks epics" count={epic.blocksEpics.length}>
              <IssueRows refs={refsOf(epic.blocksEpics)} onSelect={select} empty="No other epic." />
            </Section>
            <Section title="Implements">
              <IssueRows refs={refsOf(epic.incrementKeys)} onSelect={select} />
            </Section>
            <Section title="Remaining items" count={epic.itemKeys.filter((k) => detail.items.find((i) => i.key === k)?.schedule).length}>
              <IssueRows
                refs={refsOf(epic.itemKeys.filter((k) => detail.items.find((i) => i.key === k)?.schedule))}
                onSelect={select}
                empty="All done."
              />
            </Section>
          </>
        )}

        {increment && (
          <>
            <div className="rounded-xl bg-[var(--ms-surface)] px-3.5 py-3 shadow-[var(--ms-shadow-card)]">
              <div className="mb-2 flex items-baseline justify-between text-[13px]">
                <span className="font-medium text-[var(--ms-label)]">Progress</span>
                <span className="tabular-nums text-[var(--ms-label-2)]">
                  {increment.progress.done}/{increment.progress.total} items · {percentDone(increment.progress)}%
                </span>
              </div>
              <ProgressBar progress={increment.progress} />
            </div>
            {increment.capabilities.length > 0 && (
              <Section title="Capability">
                <div className="divide-y divide-[var(--ms-sep)] rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]">
                  {increment.capabilities.map((c) => (
                    <div key={c.key} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                      <span className="font-mono text-[11px] text-[var(--ms-label-3)]">{c.key}</span>
                      <span className="text-[var(--ms-label)]">{c.summary}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <Section title="Team epics" count={increment.teamEpics.length}>
              <IssueRows refs={refsOf(increment.teamEpics.map((e) => e.key))} onSelect={select} />
            </Section>
            <Section title="Waits on increments">
              <IssueRows
                refs={refsOf([...new Set([...increment.blockedBy, ...increment.derivedBlockedBy])])}
                onSelect={select}
                empty="None declared or found in team work."
              />
            </Section>
            <Section title="Blocks increments">
              <IssueRows
                refs={refsOf([...new Set([...increment.blocks, ...increment.derivedBlocks])])}
                onSelect={select}
                empty="None declared or found in team work."
              />
            </Section>
          </>
        )}
      </div>

      {(jiraBaseUrl || onShowInTimeline) && (
        <div className="flex gap-2 border-t border-[var(--ms-sep)] p-3">
          {onShowInTimeline && (item?.schedule || epic || increment) && (
            <button
              type="button"
              onClick={onShowInTimeline}
              className="flex flex-1 items-center justify-center rounded-lg bg-[var(--ms-accent)] px-3 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Show on critical path
            </button>
          )}
          {jiraBaseUrl && <a
            href={`${jiraBaseUrl}/browse/${selectedKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--ms-fill)] px-3 py-2 text-[13px] font-medium text-[var(--ms-accent-text)] transition-colors hover:bg-[var(--ms-sep-strong)]"
          >
            Open in Jira
            <span aria-hidden="true">↗</span>
          </a>}
        </div>
      )}
    </aside>
  );
}
