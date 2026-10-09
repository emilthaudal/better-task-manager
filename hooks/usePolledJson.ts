"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { samePayload } from "@/lib/milestoneView";

const POLL_INTERVAL_MS = 60_000;

/**
 * Fetches JSON on mount and re-polls in the background. Background failures
 * are swallowed so a flaky poll never replaces a good view with an error.
 *
 * A poll whose payload is unchanged (ignoring `generatedAt`) keeps the
 * previous object, so memoised layouts, scroll position and selection survive.
 * Polling pauses while the tab is hidden and catches up when it returns.
 */
export function usePolledJson<T>(url: string | null, intervalMs = POLL_INTERVAL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      if (!url) return;
      if (!silent) setLoading(true);
      setRefreshing(true);
      lastFetchRef.current = Date.now();
      try {
        const res = await fetch(url);
        const body = (await res.json()) as T | { error: string };
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
        }
        if (!isMountedRef.current) return;
        setData((prev) => (prev !== null && samePayload(prev, body) ? prev : (body as T)));
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        if (!isMountedRef.current || silent) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (isMountedRef.current) {
          setRefreshing(false);
          if (!silent) setLoading(false);
        }
      }
    },
    [url],
  );

  useEffect(() => {
    isMountedRef.current = true;
    void load(false);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchRef.current > intervalMs) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      isMountedRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, intervalMs]);

  const refresh = useCallback(() => void load(true), [load]);
  const retry = useCallback(() => void load(false), [load]);

  return { data, loading, refreshing, error, lastUpdated, refresh, retry };
}
