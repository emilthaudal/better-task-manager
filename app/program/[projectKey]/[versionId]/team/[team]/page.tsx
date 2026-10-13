"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PanelRight } from "lucide-react";
import MilestoneInspector from "@/components/milestone/MilestoneInspector";
import { ErrorState, ShortcutsSheet, Skeleton, ToolButton, Toolbar } from "@/components/milestone/MilestoneChrome";
import { MilestoneProvider } from "@/components/milestone/MilestoneContext";
import { FilterBar, useInspector, useWorkspaceKeys } from "@/components/milestone/MilestoneWorkspace";
import { TeamPageView } from "@/components/milestone/TeamLoad";
import { useProgram } from "@/components/milestone/ProgramShell";
import { useMilestoneViewState } from "@/hooks/useMilestoneViewState";
import { rankMatches } from "@/lib/milestoneInsights";
import { matchItems } from "@/lib/milestoneView";
import type { MilestoneViewState } from "@/lib/milestoneView";

// A team page writes only selection and filter to its URL: tabs and lane
// options belong to the milestone page.
const TEAM_URL_PARTS: ReadonlyArray<keyof MilestoneViewState> = ["item", "query"];

function TeamSkeleton() {
  return (
    <div role="status" aria-label="Loading team" className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <Skeleton className="h-[300px] w-full rounded-2xl" />
      <Skeleton className="h-[160px] w-full rounded-2xl" />
    </div>
  );
}

function TeamView() {
  const params = useParams<{ team: string }>();
  const teamName = decodeURIComponent(params.team);
  const { milestone, projectKey, versionId, href, jiraBaseUrl, program } = useProgram();
  const { data, loading, error, retry } = milestone;
  const router = useRouter();
  const [view, setView] = useMilestoneViewState(TEAM_URL_PARTS);
  const searchRef = useRef<HTMLInputElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const inspector = useInspector(view, setView);
  const { inspect, setOpen } = inspector;

  // The filter here only ever narrows this team's lists.
  const matches = useMemo(() => (data ? matchItems(data, view.query) : null), [data, view.query]);
  const ranked = useMemo(() => {
    if (!data) return [];
    const own = matches ? new Set([...matches].filter((k) => data.items.find((i) => i.key === k)?.team === teamName)) : null;
    return rankMatches(data, own, { showDone: false, showOutside: true });
  }, [data, matches, teamName]);

  const stepMatch = useCallback(
    (backwards: boolean) => {
      if (!ranked.length) return;
      const at = view.item ? ranked.indexOf(view.item) : -1;
      const n = ranked.length;
      const key = ranked[at === -1 ? (backwards ? n - 1 : 0) : (at + (backwards ? -1 : 1) + n) % n];
      if (key) inspect(key);
    },
    [ranked, inspect, view.item],
  );

  const showTeam = useCallback((team: string) => versionId && router.push(href.team(versionId, team)), [router, href, versionId]);
  const clearSelection = useCallback(() => setView({ item: null }), [setView]);
  const toggleInspector = useCallback(() => setOpen((o) => !o), [setOpen]);
  useWorkspaceKeys({ searchRef, shortcutsOpen, setShortcutsOpen, selectedKey: view.item, clearSelection, toggleInspector, jiraBaseUrl });

  const releaseName = data?.release.name ?? program.data?.releases.find((r) => r.id === versionId)?.name;
  useEffect(() => {
    document.title = `${teamName}${releaseName ? ` · ${releaseName}` : ""}`;
  }, [teamName, releaseName]);

  return (
    <>
      <Toolbar
        title={teamName}
        subtitle={releaseName}
        shareable={!!data}
        trailing={
          data && (
            <ToolButton label={inspector.open ? "Hide inspector" : "Show inspector"} shortcut="⌥⌘I" onClick={toggleInspector} pressed={inspector.open} disabled={!view.item}>
              <PanelRight size={17} strokeWidth={1.75} aria-hidden="true" />
            </ToolButton>
          )
        }
      />
      {loading && !data ? (
        <TeamSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={retry} what={releaseName ?? "this milestone"} projectKey={projectKey} />
      ) : data ? (
        <MilestoneProvider detail={data} selectedKey={view.item} inspect={inspect} showTeam={showTeam} jiraBaseUrl={jiraBaseUrl}>
          <FilterBar
            view={view}
            setView={setView}
            count={view.query.trim() ? ranked.length : null}
            onSubmit={stepMatch}
            inputRef={searchRef}
            laneOptions={false}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />
          <main className="relative min-h-0 flex-1">
            <div className="ms-fade-quick absolute inset-0 overflow-y-auto">
              <TeamPageView teamName={teamName} matches={matches} />
            </div>
            {inspector.open && view.item && <MilestoneInspector selectedKey={view.item} onClose={() => setOpen(false)} />}
          </main>
        </MilestoneProvider>
      ) : null}
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
    </>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamView />
    </Suspense>
  );
}
