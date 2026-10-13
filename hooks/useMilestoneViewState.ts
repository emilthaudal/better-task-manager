"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseViewState, readViewPrefs, serializeViewState, viewPrefs } from "@/lib/milestoneView";
import type { MilestoneViewState } from "@/lib/milestoneView";

const PREFS_KEY = "btm:milestoneView";

function savedPrefs() {
  if (typeof window === "undefined") return {};
  try {
    return readViewPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

/**
 * Milestone view state (tab, lane options, selection, filter) mirrored into
 * the query string so any view can be shared as a link. Uses replaceState: the
 * back button leaves the page rather than stepping through every click.
 *
 * Tab and lane options also persist locally, so they carry over to the next
 * milestone opened from the sidebar (whose links don't repeat them). `only`
 * limits what a page writes to its URL — a team page has no tabs.
 */
export function useMilestoneViewState(only?: ReadonlyArray<keyof MilestoneViewState>) {
  const params = useSearchParams();
  const [state, setState] = useState<MilestoneViewState>(() => parseViewState(new URLSearchParams(params.toString()), savedPrefs()));
  const first = useRef(true);
  const onlyRef = useRef(only);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const next = serializeViewState(state, new URLSearchParams(window.location.search), onlyRef.current).toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
    if (!onlyRef.current) {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(viewPrefs(state)));
      } catch {
        // Private mode: options just won't carry over.
      }
    }
  }, [state]);

  const update = useCallback((patch: Partial<MilestoneViewState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const changed = (Object.keys(next) as Array<keyof MilestoneViewState>).some((k) => next[k] !== prev[k]);
      return changed ? next : prev;
    });
  }, []);

  return [state, update] as const;
}
