"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

/**
 * Fetches JSON on mount and re-polls in the background. Background failures
 * are swallowed so a flaky poll never replaces a good view with an error.
 */
export function usePolledJson<T>(url: string | null, intervalMs = POLL_INTERVAL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  const load = useCallback(
    async (silent: boolean) => {
      if (!url) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(url);
        const body = (await res.json()) as T | { error: string };
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
        }
        if (!isMountedRef.current) return;
        setData(body as T);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        if (!isMountedRef.current || silent) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (isMountedRef.current && !silent) setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    isMountedRef.current = true;
    void load(false);
    const id = setInterval(() => void load(true), intervalMs);
    return () => {
      isMountedRef.current = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);

  const refresh = useCallback(() => void load(true), [load]);

  return { data, loading, error, lastUpdated, refresh };
}
