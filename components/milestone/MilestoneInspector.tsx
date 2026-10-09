"use client";

import type { ItemSchedule, MilestoneDetail } from "@/lib/milestoneTypes";
import { KeyChip, ProgressBar, StatusPill } from "./MilestoneBits";

interface Props {
  detail: MilestoneDetail;
  selectedKey: string;
  jiraBaseUrl: string;
  onSelect: (key: string | null) => void;
}

function describeSchedule(s: ItemSchedule): string {
  const start = s.earliestStart === 0 ? "Can start now" : `Can start at step ${s.earliestStart + 1}`;
  if (s.critical) return `${start} · on the critical path — any delay delays the milestone`;
  return `${start} · ${s.slack} step${s.slack === 1 ? "" : "s"} of slack`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function Chips({ keys, onSelect, critical }: { keys: string[]; onSelect: (k: string) => void; critical: Set<string> }) {
  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <KeyChip key={k} issueKey={k} onClick={onSelect} critical={critical.has(k)} />
      ))}
    </div>
  );
}

export default function MilestoneInspector({ detail, selectedKey, jiraBaseUrl, onSelect }: Props) {
  const critical = new Set(detail.criticalPath.criticalKeys);
  const item = detail.items.find((i) => i.key === selectedKey);
  const epic = detail.epics.find((e) => e.key === selectedKey);
  const increment = detail.increments.find((i) => i.key === selectedKey);
  const summary = epic?.summary ?? increment?.summary ?? item?.summary ?? "";
  const status = epic?.status ?? increment?.status ?? item?.status;

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-background/95 p-5 backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <KeyChip issueKey={selectedKey} critical={critical.has(selectedKey) || !!epic?.onCriticalPath} />
            {status && <StatusPill status={status} />}
          </div>
          <h2 className="text-base font-semibold leading-snug text-foreground">{summary}</h2>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {item && !epic && (
        <>
          <Row label="Schedule">
            {item.schedule ? describeSchedule(item.schedule) : "Done — no longer constrains the milestone"}
          </Row>
          <Row label="Owner">
            {item.team}
            {item.epicKey && (
              <>
                {" · "}
                <KeyChip issueKey={item.epicKey} onClick={onSelect} />
              </>
            )}
            {" · "}
            {item.assignee ?? <span className="text-amber-600 dark:text-amber-400">Unassigned</span>}
          </Row>
          {item.schedule && item.schedule.downstream > 0 && (
            <Row label="Impact">
              Unblocks {item.schedule.downstream} remaining item{item.schedule.downstream === 1 ? "" : "s"}
              {item.schedule.downstreamTeams.length > 0 && <> in {item.schedule.downstreamTeams.join(", ")}</>}
            </Row>
          )}
          <Row label="Blocked by">
            <Chips keys={item.blockedBy} onSelect={onSelect} critical={critical} />
          </Row>
          <Row label="Blocks">
            <Chips keys={item.blocks} onSelect={onSelect} critical={critical} />
          </Row>
        </>
      )}

      {epic && (
        <>
          <Row label="Team">{epic.team}</Row>
          <Row label="Progress">
            <ProgressBar progress={epic.progress} className="mb-1" />
            <span className="text-xs text-muted-foreground">
              {epic.progress.done}/{epic.progress.total} done · {epic.criticalItems} critical
            </span>
          </Row>
          <Row label="Implements">
            <Chips keys={epic.incrementKeys} onSelect={onSelect} critical={critical} />
          </Row>
          <Row label="Waits on epics">
            <Chips keys={epic.blockedByEpics} onSelect={onSelect} critical={critical} />
          </Row>
          <Row label="Blocks epics">
            <Chips keys={epic.blocksEpics} onSelect={onSelect} critical={critical} />
          </Row>
          <Row label="Items">
            <Chips
              keys={epic.itemKeys.filter((k) => detail.items.find((i) => i.key === k)?.schedule)}
              onSelect={onSelect}
              critical={critical}
            />
          </Row>
        </>
      )}

      {increment && (
        <>
          <Row label="Capability">
            {increment.capabilities.map((c) => (
              <div key={c.key}>
                <span className="font-mono text-xs text-muted-foreground">{c.key}</span> {c.summary}
              </div>
            ))}
          </Row>
          <Row label="Progress">
            <ProgressBar progress={increment.progress} className="mb-1" />
            <span className="text-xs text-muted-foreground">
              {increment.progress.done}/{increment.progress.total} items done · {increment.criticalItems} critical
            </span>
          </Row>
          <Row label="Team epics">
            <Chips keys={increment.teamEpics.map((e) => e.key)} onSelect={onSelect} critical={critical} />
          </Row>
          <Row label="Declared: blocks / blocked by">
            <div className="flex flex-col gap-1">
              <Chips keys={increment.blocks} onSelect={onSelect} critical={critical} />
              <Chips keys={increment.blockedBy} onSelect={onSelect} critical={critical} />
            </div>
          </Row>
          <Row label="From team work: blocks / blocked by">
            <div className="flex flex-col gap-1">
              <Chips keys={increment.derivedBlocks} onSelect={onSelect} critical={critical} />
              <Chips keys={increment.derivedBlockedBy} onSelect={onSelect} critical={critical} />
            </div>
          </Row>
        </>
      )}

      {jiraBaseUrl && (
        <a
          href={`${jiraBaseUrl}/browse/${selectedKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          Open {selectedKey} in Jira ↗
        </a>
      )}
    </aside>
  );
}
