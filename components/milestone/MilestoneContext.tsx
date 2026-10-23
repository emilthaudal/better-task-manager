"use client";

import { createContext, useContext, useMemo } from "react";
import type { Increment, MilestoneDetail, TeamEpic, TeamSummary, WorkItem } from "@/lib/milestoneTypes";
import { teamColors } from "@/lib/teamColor";

// What every row, chip and card inside a milestone needs — lookups, team
// colours, the selection and how to change it — without threading props
// through each layer (the mac app's `milestoneNavigator` environment value).

export interface MilestoneIndex {
  items: Map<string, WorkItem>;
  epics: Map<string, TeamEpic>;
  increments: Map<string, Increment>;
  teams: Map<string, TeamSummary>;
  critical: Set<string>;
}

export function buildIndex(detail: MilestoneDetail): MilestoneIndex {
  return {
    items: new Map(detail.items.map((i) => [i.key, i])),
    epics: new Map(detail.epics.map((e) => [e.key, e])),
    increments: new Map(detail.increments.map((i) => [i.key, i])),
    teams: new Map(detail.teams.map((t) => [t.name, t])),
    critical: new Set(detail.criticalPath.criticalKeys),
  };
}

/**
 * Colours over every team in the milestone, the set the mac app registers.
 * External items carry their own team (Finance, ERP…), and leaving them out
 * would shift the probing and give a team a different colour here than in
 * the timeline.
 */
export function milestoneTeamColors(detail: MilestoneDetail): Map<string, string> {
  return teamColors([...detail.teams.map((t) => t.name), ...detail.items.map((i) => i.team)]);
}

export interface MilestoneNav {
  detail: MilestoneDetail;
  index: MilestoneIndex;
  /** Team name → hex, assigned over the whole milestone so no two teams share one. */
  colors: Map<string, string>;
  selectedKey: string | null;
  /** Select and show in the inspector. */
  inspect: (key: string) => void;
  showTeam: (team: string) => void;
  jiraBaseUrl: string;
}

const Ctx = createContext<MilestoneNav | null>(null);

export function useMilestone(): MilestoneNav {
  const value = useContext(Ctx);
  if (!value) throw new Error("useMilestone must be used inside MilestoneProvider");
  return value;
}

export function MilestoneProvider({
  detail,
  selectedKey,
  inspect,
  showTeam,
  jiraBaseUrl,
  children,
}: Omit<MilestoneNav, "index" | "colors"> & { children: React.ReactNode }) {
  const index = useMemo(() => buildIndex(detail), [detail]);
  const colors = useMemo(() => milestoneTeamColors(detail), [detail]);
  const value = useMemo(
    () => ({ detail, index, colors, selectedKey, inspect, showTeam, jiraBaseUrl }),
    [detail, index, colors, selectedKey, inspect, showTeam, jiraBaseUrl],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
