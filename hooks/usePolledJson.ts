"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { samePayload } from "@/lib/milestoneView";

const POLL_INTERVAL_MS = 60_000;

interface Loaded {
  url: string;
  data: unknown;
  at: Date;
}

/**
 * Last good response per URL for this tab. Switching milestones in the sidebar
 * and back shows the previous one at once while it refreshes, the way the mac
 * app keeps every loaded milestone in its store.
 */
const cache = new Map<string, Loaded>();

/** The last good response for `url`, if this tab has loaded it — for hints like the sidebar's warning badges. */
export function cachedJson<T>(url: string): T | null {
  return (cache.get(url)?.data as T | undefined) ?? null;
}

/**
 * Fetches JSON on mount and re-polls in the background.
 *
 * A failure only becomes `error` while nothing is on screen for this URL;
 * once data is showing, a failed refresh is kept in `backgroundError` for a
 * quiet indicator instead of replacing a good view with an error page.
 *
 * A poll whose payload is unchanged (ignoring `generatedAt`) keeps the
 * previous object, so memoised layouts, scroll position and selection survive.
 * Polling pauses while the tab is hidden and catches up when it returns.
 */
export function usePolledJson<T>(url: string | null, intervalMs = POLL_INTERVAL_MS) {
  const [loaded, setLoaded] = useState<Loaded | null>(() => (url ? (cache.get(url) ?? null) : null));
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [inFlight, setInFlight] = useState<Record<string, number>>({});
  const urlRef = useRef(url);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);

  const current = url && loaded?.url === url ? loaded : url ? (cache.get(url) ?? null) : null;
  const data = (current?.data as T | undefined) ?? null;

  const load = useCallback(async (target: string) => {
    setInFlight((m) => ({ ...m, [target]: (m[target] ?? 0) + 1 }));
    lastFetchRef.current = Date.now();
    try {
      const res = await fetch(target);
      const body = (await res.json().catch(() => ({ error: `Request failed (${res.status})` }))) as T | { error?: string };
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
      const prev = cache.get(target);
      const next: Loaded = { url: target, data: prev && samePayload(prev.data, body) ? prev.data : body, at: new Date() };
      cache.set(target, next);
      if (!mountedRef.current || urlRef.current !== target) return;
      setLoaded(next);
      setFailure(null);
    } catch (err) {
      if (!mountedRef.current || urlRef.current !== target) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setFailure({ url: target, message });
    } finally {
      if (mountedRef.current) setInFlight((m) => ({ ...m, [target]: Math.max(0, (m[target] ?? 1) - 1) }));
    }
  }, []);

  useEffect(() => {
    urlRef.current = url;
    mountedRef.current = true;
    if (!url) return;
    void load(url);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(url);
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchRef.current > intervalMs) void load(url);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, url, intervalMs]);

  const failed = failure && failure.url === url ? failure : null;
  const refresh = useCallback(() => {
    if (urlRef.current) void load(urlRef.current);
  }, [load]);
  const retry = useCallback(() => {
    setFailure(null);
    if (urlRef.current) void load(urlRef.current);
  }, [load]);

  return {
    data,
    loading: !!url && !data && !failed,
    refreshing: !!url && (inFlight[url] ?? 0) > 0,
    error: failed && !data ? failed.message : null,
    /** Set when the latest refresh failed while older data stays on screen. */
    backgroundError: failed && data ? failed.message : null,
    lastUpdated: current?.at ?? null,
    refresh,
    retry,
  };
}
