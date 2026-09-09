"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import GraphView from "@/components/GraphView";
import KanbanView from "@/components/KanbanView";
import ViewTabs from "@/components/ViewTabs";
import type { ViewTab } from "@/components/ViewTabs";
import IssueDetailPanel from "@/components/IssueDetailPanel";
import GraphPageHeader from "@/components/GraphPageHeader";
import { GraphLoadingState, GraphErrorState, GraphEmptyState } from "@/components/GraphStates";
import type { JiraIssue } from "@/lib/jira";
import type { StreamMessage } from "@/lib/streamTypes";
import { useJiraBaseUrl } from "@/hooks/useJiraBaseUrl";
import { useBoardIssues } from "@/hooks/useBoardIssues";

const POLL_INTERVAL_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedupeByKey(issues: JiraIssue[]): JiraIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectGraphPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const jiraBaseUrl = useJiraBaseUrl();

  // `issues` is only set once streaming is fully complete — GraphView must
  // receive a stable, final array so that buildGraph (which locks layoutDoneRef)
  // runs exactly once on the complete dataset rather than on a partial stream.
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [latestIssues, setLatestIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not yet streaming, object = streaming in progress
  const [expandProgress, setExpandProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewTab>("graph");

  // Board data is independent of the epic-scoped graph data — it
  // covers every issue in the project (including those under a done epic or
  // with no epic at all), so it's fetched separately and lazily, only once
  // the Kanban tab is opened.
  const boardData = useBoardIssues(projectKey, activeView === "kanban");

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // Accumulates issues during streaming — flushed to state on "done"
  const accIssuesRef = useRef<JiraIssue[]>([]);

  const handleNodeSelect = useCallback((key: string | null) => {
    setSelectedKey(key);
  }, []);

  const streamIssues = useCallback(async (project: string, silent = false) => {
    // Cancel any previous in-flight stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      setLoading(true);
      setError(null);
      setIssues([]);
      setExpandProgress(null);
    }
    accIssuesRef.current = [];

    let fatalError = false;

    try {
      const res = await fetch(
        `/api/jira/issues/project?project=${encodeURIComponent(project)}`,
        { signal: controller.signal },
      );

      if (!res.ok || !res.body) {
        throw new Error(`Failed to load issues (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep any partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let msg: StreamMessage;
          try {
            msg = JSON.parse(trimmed) as StreamMessage;
          } catch {
            console.warn("[project-stream] Failed to parse line:", trimmed);
            continue;
          }

          if (!isMountedRef.current) return;

          if (msg.type === "epics") {
            // Accumulate epics — do NOT push to state yet (GraphView would
            // run buildGraph on partial data and lock out further updates)
            accIssuesRef.current = dedupeByKey([...accIssuesRef.current, ...msg.issues]);
            if (!silent) setExpandProgress({ done: 0, total: msg.total });
          } else if (msg.type === "children") {
            accIssuesRef.current = dedupeByKey([...accIssuesRef.current, ...msg.issues]);
            if (!silent) setExpandProgress({ done: msg.expanded, total: msg.total });
          } else if (msg.type === "error") {
            if (msg.epicKey === "" && !silent) {
              // Fatal top-level error (e.g. getEpics failed) — ignored for
              // silent background polls, which fail silently like useIssuePoller
              fatalError = true;
              setError(msg.error);
              setLoading(false);
            }
            // Per-epic errors are non-fatal — the graph keeps building
          } else if (msg.type === "done") {
            if (!fatalError) {
              if (silent) {
                // Patch GraphView in place via latestIssues — do not touch
                // `issues` (that would re-run buildGraph and reset layout)
                setLatestIssues(accIssuesRef.current);
              } else {
                // Flush the complete accumulated set to state exactly once —
                // GraphView will run buildGraph on the full dataset
                setIssues(accIssuesRef.current);
                setLatestIssues(accIssuesRef.current);
                setExpandProgress(null);
                setLoading(false);
              }
              setLastUpdated(new Date());
            }
          }
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return; // navigation away
      if (silent) return; // swallow background polling errors
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    isMountedRef.current = true;

    void streamIssues(projectKey);

    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [projectKey, streamIssues]);

  // Background polling — refreshes latestIssues in place every 30s so the
  // graph reflects board updates without disrupting the current layout.
  useEffect(() => {
    if (!projectKey || loading || error) return;

    const id = setInterval(() => {
      void streamIssues(projectKey, true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [projectKey, loading, error, streamIssues]);

  const handleViewChange = useCallback((tab: ViewTab) => {
    setActiveView(tab);
    // Clear selection when switching views
    setSelectedKey(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      <GraphPageHeader
        chipKey={projectKey}
        chipLabel="All Epics"
        issueCount={
          activeView === "kanban"
            ? boardData.issues.length
            : expandProgress === null
              ? issues.length
              : undefined
        }
        lastUpdated={
          activeView === "kanban"
            ? boardData.lastUpdated
            : expandProgress === null
              ? lastUpdated
              : null
        }
        loading={activeView === "kanban" ? boardData.loading : loading}
        error={activeView === "kanban" ? boardData.error : error}
      />

      <ViewTabs activeTab={activeView} onTabChange={handleViewChange} />

      {/* Graph + detail panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left pane — graph */}
        <div className={`flex flex-col relative ${selectedKey ? "w-[75%]" : "w-full"} transition-[width] duration-200`}>
          {activeView !== "kanban" && (
            <>
              {/* Loading overlay */}
              {(loading || expandProgress !== null) && (
                <GraphLoadingState progress={expandProgress} label="Loading epics…" />
              )}

              {error && <GraphErrorState message={error} heading="Failed to load epics" />}

              {!loading && !error && issues.length === 0 && expandProgress === null && (
                <GraphEmptyState message="No epics found for this project." />
              )}

              {!loading && !error && issues.length > 0 && activeView === "graph" && (
                <GraphView
                  issues={issues}
                  latestIssues={latestIssues}
                  onNodeSelect={handleNodeSelect}
                  selectedKey={selectedKey}
                />
              )}
            </>
          )}

          {activeView === "kanban" && (
            <>
              {boardData.loading && (
                <GraphLoadingState progress={null} label="Loading board…" />
              )}

              {boardData.error && (
                <GraphErrorState message={boardData.error} heading="Failed to load board" />
              )}

              {!boardData.loading && !boardData.error && boardData.issues.length === 0 && (
                <GraphEmptyState message="No issues found for this project." />
              )}

              {!boardData.loading && !boardData.error && boardData.issues.length > 0 && (
                <KanbanView
                  issues={boardData.issues}
                  onIssueSelect={handleNodeSelect}
                  selectedKey={selectedKey}
                  projectKey={projectKey}
                />
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedKey && (
          <div className="w-[25%] h-full border-l border-border shrink-0 shadow-[-4px_0_24px_rgba(0,0,0,0.04)]">
            <IssueDetailPanel
              issueKey={selectedKey}
              jiraBaseUrl={jiraBaseUrl}
              onClose={() => setSelectedKey(null)}
              onNavigate={(key) => setSelectedKey(key)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
