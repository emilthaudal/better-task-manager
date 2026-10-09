import { describe, expect, it } from "vitest";
import { analyzeMilestone } from "@/lib/milestoneAnalysis";
import type { AnalysisInput, EpicInput, ItemInput } from "@/lib/milestoneAnalysis";
import type { IncrementSummary, StatusRef } from "@/lib/milestoneTypes";

const TODO: StatusRef = { name: "To Do", category: "new" };
const DOING: StatusRef = { name: "In Progress", category: "indeterminate" };
const DONE: StatusRef = { name: "Done", category: "done" };

function epic(key: string, team: string, increment: string, blocks: string[] = []): EpicInput {
  return { key, summary: key, status: DOING, team, projectKey: key.split("-")[0], assignee: null, incrementKeys: [increment], blocks };
}

function item(key: string, epicKey: string | null, team: string, blocks: string[] = [], status = TODO, assignee: string | null = "dev"): ItemInput {
  return { key, summary: key, type: "Story", status, assignee, epicKey, team, points: null, external: epicKey === null, blocks };
}

function increment(key: string, teamEpics: string[], blocks: string[] = []): IncrementSummary {
  return {
    key,
    summary: key,
    status: DOING,
    team: null,
    capabilities: [],
    teamEpics: teamEpics.map((k) => ({ key: k, summary: k, status: DOING })),
    blocks,
    blockedBy: [],
  };
}

// Team A's API (A-1) gates team B's consumer (B-1 → B-2); team C works in parallel.
function crossTeamInput(): AnalysisInput {
  return {
    increments: [increment("LAD-1", ["A-E"]), increment("LAD-2", ["B-E", "C-E"])],
    epics: [epic("A-E", "Team A", "LAD-1"), epic("B-E", "Team B", "LAD-2"), epic("C-E", "Team C", "LAD-2")],
    items: [
      item("A-0", "A-E", "Team A", ["A-1"], DONE),
      item("A-1", "A-E", "Team A", ["B-1"]),
      item("B-1", "B-E", "Team B", ["B-2"]),
      item("B-2", "B-E", "Team B"),
      item("C-1", "C-E", "Team C"),
    ],
  };
}

describe("analyzeMilestone", () => {
  it("finds the longest remaining chain across teams, ignoring done work", () => {
    const r = analyzeMilestone(crossTeamInput());
    expect(r.criticalPath.keys).toEqual(["A-1", "B-1", "B-2"]);
    expect(r.criticalPath.length).toBe(3);
    const c1 = r.items.find((i) => i.key === "C-1")?.schedule;
    expect(c1?.critical).toBe(false);
    expect(c1?.slack).toBe(2);
    expect(r.items.find((i) => i.key === "A-0")?.schedule).toBeNull();
  });

  it("ranks the epic gating another team as a blocker", () => {
    const r = analyzeMilestone(crossTeamInput());
    expect(r.blockerEpics).toHaveLength(1);
    expect(r.blockerEpics[0]).toMatchObject({
      epicKey: "A-E",
      blockedEpics: ["B-E"],
      blockedTeams: ["Team B"],
      downstreamItems: 2,
      onCriticalPath: true,
      gatingItems: ["A-1"],
    });
    const teamB = r.teams.find((t) => t.name === "Team B");
    expect(teamB?.waitingOnOtherTeams).toBe(1);
    expect(r.teams.find((t) => t.name === "Team A")?.blockingOtherTeams).toBe(1);
    expect(teamB?.loadByLevel).toEqual([0, 1, 1]);
  });

  it("flags team-level dependencies the increments don't declare", () => {
    const r = analyzeMilestone(crossTeamInput());
    expect(r.increments.find((i) => i.key === "LAD-1")?.derivedBlocks).toEqual(["LAD-2"]);
    expect(r.warnings.map((w) => w.kind)).toContain("undeclared-dependency");
  });

  it("flags declared increment dependencies with nothing behind them", () => {
    const input = crossTeamInput();
    input.increments[1].blocks = ["LAD-1"];
    const r = analyzeMilestone(input);
    expect(r.warnings.some((w) => w.kind === "unbacked-dependency" && w.keys[0] === "LAD-2")).toBe(true);
  });

  it("expands an epic-level link into item sequencing when no item link exists", () => {
    const input: AnalysisInput = {
      increments: [increment("LAD-1", ["A-E", "B-E"])],
      epics: [epic("A-E", "Team A", "LAD-1", ["B-E"]), epic("B-E", "Team B", "LAD-1")],
      items: [item("A-1", "A-E", "Team A", ["A-2"]), item("A-2", "A-E", "Team A"), item("B-1", "B-E", "Team B")],
    };
    const r = analyzeMilestone(input);
    expect(r.criticalPath.keys).toEqual(["A-1", "A-2", "B-1"]);
    expect(r.dependencies.find((d) => d.from === "A-2" && d.to === "B-1")?.kind).toBe("epic");
  });

  it("schedules an epic without child items as a single placeholder step", () => {
    const input: AnalysisInput = {
      increments: [increment("LAD-1", ["A-E", "B-E"])],
      epics: [epic("A-E", "Team A", "LAD-1", ["B-E"]), epic("B-E", "Team B", "LAD-1")],
      items: [item("B-1", "B-E", "Team B")],
    };
    const r = analyzeMilestone(input);
    expect(r.items.find((i) => i.key === "A-E")?.placeholder).toBe(true);
    expect(r.criticalPath.keys).toEqual(["A-E", "B-1"]);
  });

  it("surfaces external blockers and unassigned critical items", () => {
    const input = crossTeamInput();
    input.items.push(item("X-9", null, "Platform", ["B-1"]));
    input.items[2].assignee = null;
    const r = analyzeMilestone(input);
    expect(r.warnings.find((w) => w.kind === "external-blocker")?.keys).toEqual(["X-9", "B-1"]);
    expect(r.warnings.find((w) => w.kind === "unassigned-critical")?.keys).toEqual(["B-1"]);
    expect(r.teams.map((t) => t.name)).not.toContain("Platform");
  });

  it("breaks cycles without losing sequencing downstream of them", () => {
    const input: AnalysisInput = {
      increments: [increment("LAD-1", ["A-E"])],
      epics: [epic("A-E", "Team A", "LAD-1")],
      items: [
        item("A-1", "A-E", "Team A", ["A-2"]),
        item("A-2", "A-E", "Team A", ["A-1", "A-3"]),
        item("A-3", "A-E", "Team A", ["A-4"]),
        item("A-4", "A-E", "Team A"),
      ],
    };
    const r = analyzeMilestone(input);
    expect(r.warnings.find((w) => w.kind === "cycle")?.keys).toEqual(["A-1", "A-2"]);
    expect(r.items.find((i) => i.key === "A-4")?.schedule?.earliestStart).toBe(2);
  });

  it("orders ready work critical-first", () => {
    const r = analyzeMilestone(crossTeamInput());
    expect(r.readyNow).toEqual(["A-1", "C-1"]);
  });
});
