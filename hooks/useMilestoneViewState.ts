"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseViewState, serializeViewState } from "@/lib/milestoneView";
import type { MilestoneViewState } from "@/lib/milestoneView";

/**
 * Milestone view state (tab, lane mode, selection, filter) mirrored into the
 * query string so any view can be shared as a link. Uses replaceState: the
 * back button leaves the page rather than stepping through every click.
 */
export function useMilestoneViewState() {
  const params = useSearchParams();
  const [state, setState] = useState<MilestoneViewState>(() => parseViewState(new URLSearchParams(params.toString())));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const next = serializeViewState(state, new URLSearchParams(window.location.search)).toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [state]);

  const update = useCallback((patch: Partial<MilestoneViewState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      return next.tab === prev.tab && next.lanes === prev.lanes && next.item === prev.item && next.query === prev.query ? prev : next;
    });
  }, []);

  return [state, update] as const;
}
