import { describe, expect, it } from "vitest";
import { analyzeMilestone } from "@/lib/milestoneAnalysis";
import { chainOf, columnX, layoutTimeline } from "@/lib/milestoneLayout";
import type { MilestoneDetail, StatusRef } from "@/lib/milestoneTypes";

const TODO: StatusRef = { name: "To Do", category: "new" };
const DONE: StatusRef = { name: "Done", category: "done" };

function detail(): MilestoneDetail {
  const ref = (key: string) => ({ key, summary: key, status: TODO });
  const analysis = analyzeMilestone({
    increments: [
      { key: "LAD-1", summary: "", status: TODO, team: null, capabilities: [], teamEpics: [ref("A-E"), ref("B-E")], blocks: [], blockedBy: [] },
    ],
    epics: [
      { key: "A-E", summary: "API", status: TODO, team: "Team A", projectKey: "A", assignee: null, incrementKeys: ["LAD-1"], blocks: [] },
      { key: "B-E", summary: "UI", status: TODO, team: "Team B", projectKey: "B", assignee: null, incrementKeys: ["LAD-1"], blocks: [] },
    ],
    items: [
      { key: "A-0", summary: "", type: "Story", status: DONE, assignee: null, epicKey: "A-E", team: "Team A", points: null, external: false, blocks: ["A-1"] },
      { key: "A-1", summary: "", type: "Story", status: TODO, assignee: null, epicKey: "A-E", team: "Team A", points: null, external: false, blocks: ["B-1"] },
      { key: "B-1", summary: "", type: "Story", status: TODO, assignee: null, epicKey: "B-E", team: "Team B", points: null, external: false, blocks: [] },
      { key: "B-2", summary: "", type: "Story", status: TODO, assignee: null, epicKey: "B-E", team: "Team B", points: null, external: false, blocks: [] },
    ],
  });
  return {
    project: { key: "LAD", name: "LAD" },
    release: { id: "1", name: "M1", description: null, released: false, archived: false, startDate: null, releaseDate: null, overdue: false, sequence: 0 },
    ...analysis,
    generatedAt: "",
  };
}

describe("layoutTimeline", () => {
  it("places each remaining item in the column of its earliest start", () => {
    const layout = layoutTimeline(detail(), "team");
    const x = (key: string) => layout.cards.find((c) => c.item.key === key)?.x;
    expect(x("A-1")).toBe(columnX(0));
    expect(x("B-1")).toBe(columnX(1));
    expect(x("B-2")).toBe(columnX(0));
    expect(layout.cards.some((c) => c.item.key === "A-0")).toBe(false);
  });

  it("puts lanes holding critical work first and draws only edges between visible cards", () => {
    const layout = layoutTimeline(detail(), "team");
    expect(layout.lanes.map((l) => l.id)).toEqual(["Team A", "Team B"]);
    expect(layout.edges.map((e) => `${e.dependency.from}>${e.dependency.to}`)).toEqual(["A-1>B-1"]);
  });

  it("uses one lane per epic in epic mode", () => {
    const layout = layoutTimeline(detail(), "epic");
    expect(layout.lanes.map((l) => l.title)).toEqual(["API", "UI"]);
    expect(layout.lanes[1].subtitle).toBe("B-E · Team B");
  });
});

describe("chainOf", () => {
  it("collects upstream and downstream along unsatisfied links only", () => {
    const d = detail();
    expect([...chainOf("B-1", d.dependencies)].sort()).toEqual(["A-1", "B-1"]);
  });
});
