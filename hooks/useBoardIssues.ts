import { useEffect, useRef, useState } from "react";
import type { JiraIssue } from "@/lib/jira";

const POLL_INTERVAL_MS = 30_000;

export interface UseBoardIssuesResult {
  issues: JiraIssue[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

async function fetchBoardIssues(project: string): Promise<JiraIssue[]> {
  const r = await fetch(`/api/jira/issues/board?project=${encodeURIComponent(project)}`);
  if (!r.ok) throw new Error(`Failed to load board issues (${r.status})`);
  return r.json() as Promise<JiraIssue[]>;
}

/**
 * Fetches every issue in a project (unlike the epic-scoped graph data, this is
 * not limited to children of open epics) for the kanban board view. Only
 * starts fetching once `enabled` is true, so the project graph page can defer
 * this extra request until the Kanban tab is actually opened.
 */
export function useBoardIssues(projectKey: string | undefined, enabled: boolean): UseBoardIssuesResult {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);
  // Tracks which project's data is currently loaded/loading, so a change in
  // projectKey re-triggers the fetch instead of being skipped as "already done".
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectKey || !enabled || fetchedForRef.current === projectKey) return;
    fetchedForRef.current = projectKey;
    isMountedRef.current = true;

    // Signal loading start before async work (safe: triggered by projectKey/enabled change only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchBoardIssues(projectKey)
      .then((data) => {
        if (!isMountedRef.current) return;
        setIssues(data);
        setLastUpdated(new Date());
      })
      .catch((e: Error) => {
        if (!isMountedRef.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false);
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [projectKey, enabled]);

  useEffect(() => {
    if (!projectKey || fetchedForRef.current !== projectKey || loading || error) return;

    const id = setInterval(async () => {
      try {
        const data = await fetchBoardIssues(projectKey);
        if (!isMountedRef.current) return;
        setIssues(data);
        setLastUpdated(new Date());
      } catch {
        // Silently swallow polling errors
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [projectKey, loading, error]);

  return { issues, loading, error, lastUpdated };
}
