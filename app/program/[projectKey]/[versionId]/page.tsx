"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import CriticalPathTimeline from "@/components/milestone/CriticalPathTimeline";
import MilestoneInspector from "@/components/milestone/MilestoneInspector";
import { ErrorState, MilestoneSkeleton, Toolbar } from "@/components/milestone/MilestoneChrome";
import {
  BlockerEpicsPanel,
  CriticalChainPanel,
  IncrementsPanel,
  ReadyNowPanel,
  TeamLoadPanel,
  WarningsPanel,
} from "@/components/milestone/InsightPanels";
import { KeyChip, ProgressRing, Segmented, Stat, percentDone } from "@/components/milestone/MilestoneBits";
import { useJiraBaseUrl } from "@/hooks/useJiraBaseUrl";
import { useMilestoneViewState } from "@/hooks/useMilestoneViewState";
import { usePolledJson } from "@/hooks/usePolledJson";
import { QUICK_FILTERS, hasQuickFilter, matchItems, toggleQuickFilter } from "@/lib/milestoneView";
import type { MilestoneTab, QuickFilter } from "@/lib/milestoneView";
import { cn } from "@/lib/utils";
import type { LaneMode } from "@/lib/milestoneLayout";
import type { MilestoneDetail } from "@/lib/milestoneTypes";

const TABS: Array<{ value: MilestoneTab; label: string }> = [
  { value: "path", label: "Critical path" },
  { value: "insights", label: "Blockers & teams" },
];

const LANES: Array<{ value: LaneMode; label: string }> = [
  { value: "epic", label: "By epic" },
  { value: "team", label: "By team" },
];

const CHIPS: QuickFilter[] = ["critical", "ready", "unassigned", "cross"];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Summary({ detail, onSelect }: { detail: MilestoneDetail; onSelect: (k: string) => void }) {
  const remaining = detail.progress.total - detail.progress.done;
  const top = detail.blockerEpics[0];
  const topEpic = top ? detail.epics.find((e) => e.key === top.epicKey) : undefined;
  const teams = detail.teams.filter((t) => t.remaining > 0).length;
  const crossTeam = detail.items.filter((i) => (i.schedule?.downstreamTeams.length ?? 0) > 0).length;
  const date = formatDate(detail.release.releaseDate);
  return (
    <section aria-label="Milestone summary" className="flex flex-wrap items-center gap-x-10 gap-y-4 border-b border-[var(--ms-sep)] px-8 pb-5 pt-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative shrink-0" title={`${percentDone(detail.progress)}% of items done`}>
          <ProgressRing progress={detail.progress} size={56} stroke={5} />
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums text-[var(--ms-label)]">
            {percentDone(detail.progress)}%
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[var(--ms-label-3)]">
            Milestone {detail.release.sequence + 1}
            {date && <> · {detail.release.released ? "Released" : "Due"} {date}</>}
            {detail.release.overdue && <span className="font-semibold text-[var(--ms-critical-text)]"> · Overdue</span>}
          </div>
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.022em] text-[var(--ms-label)]">{detail.release.name}</h1>
          <div className="text-[12.5px] text-[var(--ms-label-2)]">
            {remaining} of {detail.progress.total} items remaining · {teams} team{teams === 1 ? "" : "s"} · {detail.increments.length} increment
            {detail.increments.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 xl:gap-x-8">
        <Stat label="Critical path" value={detail.criticalPath.length} unit={detail.criticalPath.length === 1 ? "step" : "steps"} tone="critical" hint="Length of the longest remaining chain of blocked work" />
        <Stat label="Ready now" value={detail.readyNow.length} tone={detail.readyNow.length ? "ready" : undefined} hint="Remaining items whose blockers are all done" />
        <Stat label="Blocks other teams" value={crossTeam} tone={crossTeam ? "cross" : undefined} hint="Remaining items that other teams' work waits on" />
        <Stat label="Needs attention" value={detail.warnings.length} tone={detail.warnings.length ? "warn" : undefined} hint="Sequencing problems found in Jira links" />
        {top && (
          <button
            type="button"
            onClick={() => onSelect(top.epicKey)}
            title={`${topEpic?.summary ?? top.epicKey} — gates ${top.downstreamItems} items`}
            className="flex flex-col gap-1 rounded-lg text-left min-[1400px]:hidden"
          >
            <span className="text-[11px] font-medium text-[var(--ms-label-3)]">Biggest blocker</span>
            <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ms-label-2)]">
              <KeyChip issueKey={top.epicKey} critical={top.onCriticalPath} />
              gates {top.downstreamItems}
            </span>
          </button>
        )}
      </div>
      {top && (
        <button
          type="button"
          onClick={() => onSelect(top.epicKey)}
          className="group ml-auto hidden max-w-[340px] min-w-[240px] flex-col gap-1 min-[1400px]:flex rounded-xl bg-[var(--ms-surface)] px-3.5 py-2.5 text-left shadow-[var(--ms-shadow-card)] transition-shadow hover:shadow-[var(--ms-shadow-hover)]"
        >
          <span className="flex items-center gap-2 text-[11px] font-medium text-[var(--ms-label-3)]">
            Biggest blocker
            {top.onCriticalPath && <span className="font-semibold text-[var(--ms-critical-text)]">· on critical path</span>}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <KeyChip issueKey={top.epicKey} critical={top.onCriticalPath} />
            <span className="truncate text-[13px] font-semibold text-[var(--ms-label)]">{topEpic?.summary ?? top.epicKey}</span>
          </span>
          <span className="text-[12px] text-[var(--ms-label-2)]">
            {top.team} · gates {top.downstreamItems} item{top.downstreamItems === 1 ? "" : "s"}
            {top.blockedTeams.length > 0 && <> in <span className="font-medium text-[var(--ms-cross-text)]">{top.blockedTeams.join(", ")}</span></>}
          </span>
        </button>
      )}
    </section>
  );
}

function SearchField({
  value,
  onChange,
  onSubmit,
  count,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (backwards: boolean) => void;
  count: number | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative flex w-full min-w-[220px] max-w-[340px] items-center">
      <svg className="pointer-events-none absolute left-2.5 text-[var(--ms-label-3)]" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(e.shiftKey);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            if (value) onChange("");
            else e.currentTarget.blur();
          }
        }}
        placeholder="Filter by key, summary, person or team"
        aria-label="Filter work items"
        aria-describedby="ms-filter-count"
        className="h-8 w-full rounded-lg border-0 bg-[var(--ms-fill)] pl-8 pr-16 text-[13px] text-[var(--ms-label)] outline-none transition-shadow placeholder:text-[var(--ms-label-3)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ms-accent)_35%,transparent)] [&::-webkit-search-cancel-button]:hidden"
      />
      <span id="ms-filter-count" className="pointer-events-none absolute right-2.5 text-[11px] font-medium tabular-nums text-[var(--ms-label-3)]">
        {count !== null ? (
          <span aria-live="polite">{count} match{count === 1 ? "" : "es"}</span>
        ) : (
          <kbd className="rounded bg-[var(--ms-fill-2)] px-1.5 py-[1px] font-sans text-[10.5px]">⌘K</kbd>
        )}
      </span>
    </div>
  );
}

function MilestoneView() {
  const { projectKey, versionId } = useParams<{ projectKey: string; versionId: string }>();
  const searchParams = useSearchParams();
  const fixture = searchParams.get("fixture");
  const jiraBaseUrl = useJiraBaseUrl();
  const apiUrl = `/api/jira/milestones/${encodeURIComponent(versionId)}?project=${encodeURIComponent(projectKey)}${fixture ? `&fixture=${encodeURIComponent(fixture)}` : ""}`;
  const { data, loading, refreshing, error, lastUpdated, refresh, retry } = usePolledJson<MilestoneDetail>(apiUrl);
  const [view, setView] = useMilestoneViewState();
  const searchRef = useRef<HTMLInputElement>(null);
  const programHref = `/program/${encodeURIComponent(projectKey)}${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`;

  const select = useCallback((key: string | null) => setView({ item: key }), [setView]);
  const matches = useMemo(() => (data ? matchItems(data, view.query) : null), [data, view.query]);
  const remainingMatches = useMemo(() => {
    if (!data || !matches) return null;
    return data.items.filter((i) => i.schedule && matches.has(i.key)).map((i) => i.key);
  }, [data, matches]);

  // Enter in the filter steps through matches.
  const stepMatch = useCallback(
    (backwards: boolean) => {
      if (!remainingMatches?.length) return;
      const at = view.item ? remainingMatches.indexOf(view.item) : -1;
      const n = remainingMatches.length;
      const next = at === -1 ? (backwards ? n - 1 : 0) : (at + (backwards ? -1 : 1) + n) % n;
      select(remainingMatches[next] ?? null);
    },
    [remainingMatches, select, view.item],
  );

  // ⌘K or "/" focuses the filter; Esc clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setView({ tab: "path" });
        requestAnimationFrame(() => searchRef.current?.focus());
        searchRef.current?.select();
      } else if (e.key === "Escape" && !typing) {
        setView({ item: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  useEffect(() => {
    document.title = data ? `${data.release.name} · Critical path` : "Milestone";
  }, [data]);

  return (
    <div className="ms flex h-screen flex-col">
      <Toolbar
        backHref={programHref}
        backLabel={data?.project.name ?? projectKey}
        lastUpdated={lastUpdated}
        refreshing={refreshing && !loading}
        onRefresh={refresh}
        center={data ? <Segmented label="View" value={view.tab} onChange={(tab) => setView({ tab })} options={TABS} /> : null}
      />
      {loading && !data ? (
        <MilestoneSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={retry} backHref={programHref} />
      ) : data ? (
        <>
          <Summary detail={data} onSelect={select} />
          {view.tab === "path" && (
            <div className="flex items-center gap-3 border-b border-[var(--ms-sep)] px-8 py-2.5">
              <Segmented label="Lanes" value={view.lanes} onChange={(lanes) => setView({ lanes })} options={LANES} />
              <SearchField
                value={view.query}
                onChange={(query) => setView({ query })}
                onSubmit={stepMatch}
                count={remainingMatches ? remainingMatches.length : null}
                inputRef={searchRef}
              />
              <div role="group" aria-label="Quick filters" className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                {CHIPS.map((name) => {
                  const on = hasQuickFilter(view.query, name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setView({ query: toggleQuickFilter(view.query, name) })}
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-full px-3 py-[5px] text-[12px] font-medium transition-colors",
                        on
                          ? "bg-[var(--ms-accent)] text-white"
                          : "bg-[var(--ms-fill-2)] text-[var(--ms-label-2)] hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)]",
                      )}
                    >
                      {QUICK_FILTERS[name].label}
                    </button>
                  );
                })}
              </div>
              <span className="ml-auto hidden shrink-0 text-[11.5px] text-[var(--ms-label-3)] min-[1600px]:inline">
                Hover to trace a chain · arrow keys to move · Esc to clear
              </span>
            </div>
          )}
          <main className="relative min-h-0 flex-1">
            {view.tab === "path" ? (
              <CriticalPathTimeline
                detail={data}
                laneMode={view.lanes}
                selectedKey={view.item}
                onSelect={select}
                matches={matches}
              />
            ) : (
              <div className="absolute inset-0 overflow-y-auto">
                <div className="ms-fade-up mx-auto grid max-w-[1280px] gap-8 px-8 py-8 xl:grid-cols-[1.15fr_1fr]">
                  <div className="flex min-w-0 flex-col gap-8">
                    <BlockerEpicsPanel detail={data} onSelect={select} />
                    <TeamLoadPanel detail={data} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-8">
                    <CriticalChainPanel detail={data} onSelect={select} />
                    <WarningsPanel warnings={data.warnings} onSelect={select} />
                    <ReadyNowPanel detail={data} onSelect={select} />
                    <IncrementsPanel detail={data} onSelect={select} />
                  </div>
                </div>
              </div>
            )}
            {view.item && (
              <MilestoneInspector
                detail={data}
                selectedKey={view.item}
                jiraBaseUrl={jiraBaseUrl}
                onSelect={select}
                onShowInTimeline={view.tab === "insights" ? () => setView({ tab: "path" }) : undefined}
              />
            )}
          </main>
        </>
      ) : null}
    </div>
  );
}

export default function MilestonePage() {
  return (
    <Suspense fallback={<div className="ms flex h-screen flex-col"><MilestoneSkeleton /></div>}>
      <MilestoneView />
    </Suspense>
  );
}
