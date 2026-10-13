"use client";

import { ArrowUpRight, CircleCheck, Lightbulb, SquareDashed } from "lucide-react";
import { epicSpan, incrementLinks, levelTitle, plural, scheduleExplanation, scheduleSummary, steps } from "@/lib/milestoneInsights";
import type { Increment, ItemSchedule, StatusRef, TeamEpic, WorkItem } from "@/lib/milestoneTypes";
import { cn } from "@/lib/utils";
import { AssigneeLabel, ProgressBar, StatusDot, StatusPill } from "./MilestoneBits";
import { useMilestone } from "./MilestoneContext";
import { CriticalBadge, Team } from "./MilestoneRows";
import { Evidence } from "./MilestoneTabs";

interface Props {
  selectedKey: string;
  onClose: () => void;
  /** Offered when the timeline isn't showing — switches to it with this selection. */
  onShowInTimeline?: () => void;
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-1.5 px-1 text-[12px] font-semibold text-[var(--ms-label-2)]">
        {title}
        {count !== undefined && count > 0 && <span className="tabular-nums text-[var(--ms-label-3)]">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Keys as tappable rows: status, key, title, team. Unknown keys stay readable but inert. */
function KeyRows({ keys, empty = "None" }: { keys: string[]; empty?: string }) {
  const { index, inspect } = useMilestone();
  if (keys.length === 0) return <p className="px-1 text-[13px] text-[var(--ms-label-3)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--ms-sep)] overflow-hidden rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]">
      {keys.map((key) => {
        const item = index.items.get(key);
        const epic = index.epics.get(key);
        const inc = index.increments.get(key);
        const status: StatusRef | undefined = item?.status ?? epic?.status ?? inc?.status;
        const critical = !!item?.schedule?.critical || !!epic?.onCriticalPath;
        const team = item?.team ?? epic?.team;
        const known = !!(item || epic || inc);
        const body = (
          <>
            {status ? <StatusDot status={status} className="h-1.5 w-1.5" /> : <span className="w-1.5" />}
            <span className={cn("shrink-0 font-mono text-[11px]", critical ? "text-[var(--ms-critical-text)]" : "text-[var(--ms-label-3)]")}>{key}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">
              {item?.summary ?? epic?.summary ?? inc?.summary ?? <span className="text-[var(--ms-label-3)]">Not in this milestone</span>}
            </span>
            {team && <Team team={team} />}
            {known && <span aria-hidden="true" className="text-[var(--ms-label-3)]">›</span>}
          </>
        );
        return (
          <li key={key}>
            {known ? (
              <button type="button" onClick={() => inspect(key)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--ms-fill-2)]">
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Grid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl bg-[var(--ms-surface)] px-3.5 py-2.5 text-[13px] shadow-[var(--ms-shadow-card)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--ms-label-2)]">{label}</dt>
          <dd className="min-w-0 truncate text-right font-medium tabular-nums text-[var(--ms-label)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Where the item sits on the milestone's step axis: the solid block is when
 * it can start, the tint after it is how far it can slip before it delays
 * the finish.
 */
function ScheduleStrip({ schedule, length }: { schedule: ItemSchedule; length: number }) {
  const count = Math.max(length, schedule.latestStart + 1, 1);
  return (
    <div className="flex gap-0.5" role="img" aria-label={scheduleSummary(schedule)}>
      {Array.from({ length: count }, (_, level) => {
        const start = level === schedule.earliestStart;
        const slack = level > schedule.earliestStart && level <= schedule.latestStart;
        return (
          <span
            key={level}
            title={levelTitle(level)}
            className="h-3 min-w-[3px] flex-1 rounded-[2.5px]"
            style={{
              background: start
                ? schedule.critical
                  ? "var(--ms-critical)"
                  : "var(--ms-accent)"
                : slack
                  ? "color-mix(in srgb, var(--ms-accent) 28%, transparent)"
                  : "var(--ms-fill)",
            }}
          />
        );
      })}
    </div>
  );
}

function Header({ kind, title, status, issueKey }: { kind: string; title: string; status: StatusRef; issueKey: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 pr-8">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--ms-label-3)]">{kind}</span>
        <span className="select-text font-mono text-[12.5px] font-medium text-[var(--ms-label)]">{issueKey}</span>
        <span className="ml-auto">
          <StatusPill status={status} />
        </span>
      </div>
      <h2 className="select-text text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[var(--ms-label)]">{title}</h2>
    </div>
  );
}

function Badges({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function Tag({ tone, icon, children }: { tone: "ready" | "warn" | "neutral"; icon?: React.ReactNode; children: React.ReactNode }) {
  const style =
    tone === "ready"
      ? "bg-[var(--ms-ready-fill)] text-[var(--ms-ready-text)]"
      : tone === "warn"
        ? "bg-[var(--ms-warn-fill)] text-[var(--ms-warn-text)]"
        : "bg-[var(--ms-fill)] text-[var(--ms-label-2)]";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[10.5px] font-semibold", style)}>{icon}{children}</span>;
}

function ItemDetails({ item }: { item: WorkItem }) {
  const { detail } = useMilestone();
  const s = item.schedule;
  const step = detail.criticalPath.keys.indexOf(item.key);
  return (
    <>
      <Header kind={item.placeholder ? "Epic (not broken down)" : item.type} title={item.summary} status={item.status} issueKey={item.key} />
      <Badges>
        {s?.critical && <CriticalBadge />}
        {s?.ready && <Tag tone="ready">Ready</Tag>}
        {item.external && <Tag tone="neutral" icon={<ArrowUpRight size={10} aria-hidden="true" />}>Outside milestone</Tag>}
        {item.placeholder && <Tag tone="warn" icon={<SquareDashed size={10} aria-hidden="true" />}>No child items yet</Tag>}
        <Team team={item.team} />
      </Badges>
      {s ? (
        <Section title="Schedule">
          <div className={cn("flex flex-col gap-2.5 rounded-xl px-3.5 py-3", s.critical ? "bg-[var(--ms-critical-fill)]" : "bg-[var(--ms-fill-2)]")}>
            {step >= 0 && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ms-critical-text)]">
                Step {step + 1} of {detail.criticalPath.keys.length} on the critical path
              </div>
            )}
            <div>
              <div className="text-[14px] font-semibold text-[var(--ms-label)]">{scheduleSummary(s)}</div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--ms-label-2)]">{scheduleExplanation(s)}</p>
            </div>
            <ScheduleStrip schedule={s} length={detail.criticalPath.length} />
          </div>
          <Grid
            rows={[
              ["Earliest start", levelTitle(s.earliestStart)],
              ["Latest start", levelTitle(s.latestStart)],
              ["Slack", steps(s.slack)],
              ["Unblocks", plural(s.downstream, "item")],
            ]}
          />
          {s.downstreamTeams.length > 0 && (
            <div className="flex flex-col gap-1 px-1 pt-1">
              <span className="text-[11.5px] text-[var(--ms-label-3)]">Other teams waiting on this</span>
              <div className="flex flex-wrap gap-1">
                {s.downstreamTeams.map((t) => (
                  <Team key={t} team={t} />
                ))}
              </div>
            </div>
          )}
        </Section>
      ) : item.status.category === "done" ? (
        <p className="flex items-center gap-1.5 rounded-xl bg-[var(--ms-ready-fill)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--ms-ready-text)]">
          <CircleCheck size={15} aria-hidden="true" /> Done — no longer constrains the plan.
        </p>
      ) : null}
      <Section title="Blocked by" count={item.blockedBy.length}>
        <KeyRows keys={item.blockedBy} empty="Nothing blocks this." />
      </Section>
      <Section title="Blocks" count={item.blocks.length}>
        <KeyRows keys={item.blocks} empty="Nothing waits on this." />
      </Section>
      <Section title="Details">
        <Grid
          rows={[
            ["Assignee", <span key="a" className="inline-flex justify-end"><AssigneeLabel name={item.assignee} /></span>],
            ...(item.epicKey ? ([["Epic", <EpicLink key="e" issueKey={item.epicKey} />]] as Array<[string, React.ReactNode]>) : []),
            ...(item.incrementKey ? ([["Increment", <EpicLink key="i" issueKey={item.incrementKey} />]] as Array<[string, React.ReactNode]>) : []),
            ...(item.points !== null ? ([["Points", String(item.points)]] as Array<[string, React.ReactNode]>) : []),
          ]}
        />
      </Section>
    </>
  );
}

function EpicLink({ issueKey }: { issueKey: string }) {
  const { index, inspect } = useMilestone();
  const title = index.epics.get(issueKey)?.summary ?? index.increments.get(issueKey)?.summary;
  if (!title) return <span className="font-mono text-[12px]">{issueKey}</span>;
  return (
    <button type="button" onClick={() => inspect(issueKey)} className="max-w-full truncate text-[var(--ms-accent-text)] hover:underline" title={`${issueKey} — ${title}`}>
      {title}
    </button>
  );
}

function EpicDetails({ epic }: { epic: TeamEpic }) {
  const { detail, index } = useMilestone();
  const blocker = detail.blockerEpics.find((b) => b.epicKey === epic.key);
  const span = epicSpan(epic);
  const remaining = epic.itemKeys.filter((k) => index.items.get(k)?.status.category !== "done" && index.items.has(k));
  return (
    <>
      <Header kind="Team epic" title={epic.summary} status={epic.status} issueKey={epic.key} />
      <Badges>
        {epic.onCriticalPath && <CriticalBadge />}
        <Team team={epic.team} />
      </Badges>
      <Section title="Progress">
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--ms-surface)] px-3.5 py-3 shadow-[var(--ms-shadow-card)]">
          <ProgressBar progress={epic.progress} className="h-2" />
          <p className="text-[12.5px] text-[var(--ms-label-2)]">
            {epic.progress.done} of {epic.progress.total} done · {epic.progress.inProgress} in progress
          </p>
          {span && (
            <p className="text-[12.5px] text-[var(--ms-label)]">
              Remaining work spans {span}
              {epic.criticalItems > 0 && <span className="text-[var(--ms-critical-text)]"> · {plural(epic.criticalItems, "critical item")}</span>}
            </p>
          )}
        </div>
      </Section>
      {blocker && (
        <Section title="Gating work">
          <p className="px-1 text-[12.5px] leading-snug text-[var(--ms-label)]">
            {plural(blocker.downstreamItems, "item")} elsewhere wait{blocker.downstreamItems === 1 ? "s" : ""} on this epic
            {blocker.blockedTeams.length > 0 ? <>, across <span className="font-semibold">{blocker.blockedTeams.join(", ")}</span>.</> : "."}
          </p>
          <KeyRows keys={blocker.gatingItems} />
        </Section>
      )}
      <Section title="Blocks epics" count={epic.blocksEpics.length}>
        <KeyRows keys={epic.blocksEpics} empty="No other epic waits on this." />
      </Section>
      <Section title="Blocked by epics" count={epic.blockedByEpics.length}>
        <KeyRows keys={epic.blockedByEpics} empty="Not waiting on another epic." />
      </Section>
      <Section title="Implements">
        <KeyRows keys={epic.incrementKeys} />
      </Section>
      <Section title="Remaining items" count={remaining.length}>
        <KeyRows keys={remaining} empty="All done." />
      </Section>
    </>
  );
}

function IncrementDetails({ increment }: { increment: Increment }) {
  const { jiraBaseUrl } = useMilestone();
  const links = [
    ...incrementLinks(increment.blocks, increment.derivedBlocks).map((l) => ({ ...l, direction: "Blocks" })),
    ...incrementLinks(increment.blockedBy, increment.derivedBlockedBy).map((l) => ({ ...l, direction: "After" })),
  ];
  return (
    <>
      <Header kind="Increment" title={increment.summary} status={increment.status} issueKey={increment.key} />
      <Section title="Capabilities">
        {increment.capabilities.length === 0 ? (
          <p className="px-1 text-[13px] text-[var(--ms-label-3)]">Not linked to a capability.</p>
        ) : (
          <ul className="divide-y divide-[var(--ms-sep)] overflow-hidden rounded-xl bg-[var(--ms-surface)] shadow-[var(--ms-shadow-card)]">
            {increment.capabilities.map((c) => {
              const body = (
                <>
                  <Lightbulb size={14} className="shrink-0 text-[var(--ms-warn)]" aria-hidden="true" />
                  <span className="shrink-0 font-mono text-[11px] text-[var(--ms-label-3)]">{c.key}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ms-label)]">{c.summary}</span>
                  {jiraBaseUrl && <ArrowUpRight size={13} className="shrink-0 text-[var(--ms-label-3)]" aria-hidden="true" />}
                </>
              );
              return (
                <li key={c.key}>
                  {jiraBaseUrl ? (
                    <a
                      href={`${jiraBaseUrl}/browse/${c.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${c.key} in Jira Product Discovery`}
                      className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--ms-fill-2)]"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title="Progress">
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--ms-surface)] px-3.5 py-3 shadow-[var(--ms-shadow-card)]">
          <ProgressBar progress={increment.progress} className="h-2" />
          <p className="text-[12.5px] text-[var(--ms-label-2)]">
            {increment.progress.done} of {increment.progress.total} items done
            {increment.criticalItems > 0 && <span className="text-[var(--ms-critical-text)]"> · {plural(increment.criticalItems, "critical item")}</span>}
          </p>
        </div>
      </Section>
      <Section title="Team epics" count={increment.teamEpics.length}>
        <KeyRows keys={increment.teamEpics.map((e) => e.key)} empty="No team epics yet." />
      </Section>
      <Section title="Dependencies">
        {links.length === 0 ? (
          <p className="px-1 text-[13px] text-[var(--ms-label-3)]">None declared or derived.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => (
              <li key={`${l.direction}-${l.key}`} className="flex items-center gap-2">
                <span className="w-11 shrink-0 text-[11.5px] text-[var(--ms-label-3)]">{l.direction}</span>
                <div className="min-w-0 flex-1">
                  <KeyRows keys={[l.key]} />
                </div>
                <Evidence evidence={l.evidence} compact />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export default function MilestoneInspector({ selectedKey, onClose, onShowInTimeline }: Props) {
  const { index, jiraBaseUrl } = useMilestone();
  const item = index.items.get(selectedKey);
  const epic = index.epics.get(selectedKey);
  const increment = index.increments.get(selectedKey);
  return (
    <aside
      aria-label={`Details for ${selectedKey}`}
      className="ms-material ms-sheet-in absolute bottom-3 right-3 top-3 z-40 flex w-[380px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl"
    >
      <div className="flex items-center justify-end px-3 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          title="Close (⌥⌘I)"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ms-fill)] text-[var(--ms-label-2)] transition-colors hover:bg-[var(--ms-sep-strong)] hover:text-[var(--ms-label)]"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Keyed so moving between items cross-fades instead of snapping. */}
      <div key={selectedKey} className="ms-fade-quick -mt-3 flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {item ? (
          <ItemDetails item={item} />
        ) : epic ? (
          <EpicDetails epic={epic} />
        ) : increment ? (
          <IncrementDetails increment={increment} />
        ) : (
          <p className="pt-8 text-center text-[13px] text-[var(--ms-label-2)]">{selectedKey} isn’t part of this milestone.</p>
        )}
      </div>
      {(jiraBaseUrl || onShowInTimeline) && (
        <div className="flex gap-2 border-t border-[var(--ms-sep)] p-3">
          {onShowInTimeline && (item?.schedule || epic || increment) && (
            <button
              type="button"
              onClick={onShowInTimeline}
              className="flex flex-1 items-center justify-center rounded-lg bg-[var(--ms-fill)] px-3 py-2 text-[13px] font-medium text-[var(--ms-label)] transition-colors hover:bg-[var(--ms-sep-strong)]"
            >
              Show on critical path
            </button>
          )}
          {jiraBaseUrl && (
            <a
              href={`${jiraBaseUrl}/browse/${selectedKey}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${selectedKey} in Jira (⇧⌘O)`}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--ms-accent)] px-3 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Open in Jira
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
