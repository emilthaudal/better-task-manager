"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import GraphPageHeader from "@/components/GraphPageHeader";
import { GraphErrorState, GraphLoadingState } from "@/components/GraphStates";
import CriticalPathTimeline from "@/components/milestone/CriticalPathTimeline";
import MilestoneInspector from "@/components/milestone/MilestoneInspector";
import {
  BlockerEpicsPanel,
  IncrementsPanel,
  ReadyNowPanel,
  TeamLoadPanel,
  WarningsPanel,
} from "@/components/milestone/InsightPanels";
import { KeyChip, ProgressBar, Stat, percentDone } from "@/components/milestone/MilestoneBits";
import { useJiraBaseUrl } from "@/hooks/useJiraBaseUrl";
import { usePolledJson } from "@/hooks/usePolledJson";
import type { LaneMode } from "@/lib/milestoneLayout";
import type { MilestoneDetail } from "@/lib/milestoneTypes";

type Tab = "path" | "insights";

function Toggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Summary({ detail, onSelect }: { detail: MilestoneDetail; onSelect: (k: string) => void }) {
  const remaining = detail.progress.total - detail.progress.done;
  const top = detail.blockerEpics[0];
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border bg-background px-8 py-5">
      <div className="min-w-64">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/program/${detail.project.key}`} className="hover:text-foreground">
            {detail.project.name}
          </Link>
          <span>/</span>
          <span>Milestone {detail.release.sequence + 1}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.release.name}</h1>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar progress={detail.progress} className="w-48" />
          <span className="text-xs tabular-nums text-muted-foreground">{percentDone(detail.progress)}% of items done</span>
        </div>
      </div>
      <Stat label="Critical path" value={`${detail.criticalPath.length} steps`} tone="critical" />
      <Stat label="Remaining" value={remaining} />
      <Stat label="Ready now" value={detail.readyNow.length} />
      <Stat label="Teams" value={detail.teams.filter((t) => t.remaining > 0).length} />
      <Stat label="Attention" value={detail.warnings.length} tone={detail.warnings.length ? "warn" : undefined} />
      {top && (
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Biggest blocker</span>
          <span className="flex items-center gap-2 text-sm">
            <KeyChip issueKey={top.epicKey} onClick={onSelect} critical={top.onCriticalPath} />
            <span className="text-muted-foreground">gates {top.downstreamItems} items</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function MilestonePage() {
  const { projectKey, versionId } = useParams<{ projectKey: string; versionId: string }>();
  const jiraBaseUrl = useJiraBaseUrl();
  const { data, loading, error, lastUpdated } = usePolledJson<MilestoneDetail>(
    `/api/jira/milestones/${encodeURIComponent(versionId)}?project=${encodeURIComponent(projectKey)}`,
  );
  const [tab, setTab] = useState<Tab>("path");
  const [laneMode, setLaneMode] = useState<LaneMode>("epic");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const select = useCallback((key: string | null) => setSelectedKey(key), []);

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <GraphPageHeader
        chipKey={projectKey}
        chipLabel={data?.release.name ?? "Milestone"}
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
      />
      {loading && !data ? (
        <div className="relative flex-1">
          <GraphLoadingState label="Analysing milestone…" />
        </div>
      ) : error && !data ? (
        <div className="relative flex-1">
          <GraphErrorState message={error} backHref={`/program/${projectKey}`} />
        </div>
      ) : data ? (
        <>
          <Summary detail={data} onSelect={select} />
          <div className="flex items-center gap-3 border-b border-border bg-background px-8 py-2">
            <Toggle
              value={tab}
              onChange={setTab}
              options={[
                { value: "path", label: "Critical path" },
                { value: "insights", label: "Blockers & teams" },
              ]}
            />
            {tab === "path" && (
              <>
                <Toggle
                  value={laneMode}
                  onChange={setLaneMode}
                  options={[
                    { value: "epic", label: "Lanes by epic" },
                    { value: "team", label: "Lanes by team" },
                  ]}
                />
                <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-rose-500" /> critical</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-violet-500" /> cross-team</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t border-dashed border-slate-400" /> epic-level link</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-border" /> slack</span>
                </div>
              </>
            )}
          </div>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-auto">
              {tab === "path" ? (
                <div className="p-6">
                  <CriticalPathTimeline detail={data} laneMode={laneMode} selectedKey={selectedKey} onSelect={select} />
                </div>
              ) : (
                <div className="mx-auto grid max-w-7xl gap-8 p-8 xl:grid-cols-2">
                  <div className="flex flex-col gap-8">
                    <BlockerEpicsPanel detail={data} onSelect={select} />
                    <TeamLoadPanel detail={data} />
                  </div>
                  <div className="flex flex-col gap-8">
                    <WarningsPanel warnings={data.warnings} onSelect={select} />
                    <ReadyNowPanel detail={data} onSelect={select} />
                    <IncrementsPanel detail={data} onSelect={select} />
                  </div>
                </div>
              )}
            </main>
            {selectedKey && (
              <MilestoneInspector detail={data} selectedKey={selectedKey} jiraBaseUrl={jiraBaseUrl} onSelect={select} />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
