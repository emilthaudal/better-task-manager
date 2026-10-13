import { describe, expect, it } from "vitest";
import { analyzeMilestone } from "@/lib/milestoneAnalysis";
import { CARD_WIDTH, CELL_LIMIT, chainOf, columnX, layoutTimeline } from "@/lib/milestoneLayout";
import type { MilestoneDetail, StatusRef } from "@/lib/milestoneTypes";

const TODO: StatusRef = { name: "To Do", category: "new" };
const DONE: StatusRef = { name: "Done", category: "done" };

type Extra = { key: string; team?: string; epicKey?: string | null; external?: boolean; done?: boolean; blocks?: string[] };

function detail(extra: Extra[] = []): MilestoneDetail {
  const ref = (key: string) => ({ key, summary: key, status: TODO });
  const more = extra.map((e) => ({
    key: e.key,
    summary: "",
    type: "Story",
    status: e.done ? DONE : TODO,
    assignee: null,
    epicKey: e.epicKey === undefined ? "B-E" : e.epicKey,
    team: e.team ?? "Team B",
    points: null,
    external: !!e.external,
    blocks: e.blocks ?? [],
  }));
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
      ...more,
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

  it("can drop lanes (e.g. without filter matches) while keeping every card's column", () => {
    const layout = layoutTimeline(detail(), "team", { includeLane: (members) => members.some((m) => m.key === "B-1") });
    expect(layout.lanes.map((l) => l.id)).toEqual(["Team B"]);
    expect(layout.lanes[0].y).toBe(0);
    expect(layout.cards.find((c) => c.item.key === "B-1")?.x).toBe(columnX(1));
    expect(layout.columns).toBe(2);
    expect(layout.edges).toEqual([]);
  });

  it("puts done items in a leading Done column when asked", () => {
    const layout = layoutTimeline(detail(), "team", { showDone: true });
    const x = (key: string) => layout.cards.find((c) => c.item.key === key)?.x;
    expect(layout.doneColumn).toBe(true);
    expect(layout.columns).toBe(3);
    expect(layout.columnStats?.map((c) => c.level)).toEqual([null, 0, 1]);
    expect(x("A-0")).toBe(columnX(0));
    expect(x("A-1")).toBe(columnX(1));
    expect(x("B-1")).toBe(columnX(2));
    const satisfied = layout.edges.find((e) => e.dependency.from === "A-0");
    expect(satisfied?.dependency.satisfied).toBe(true);
    expect(layout.lanes[0]?.subtitle).toBe("1 remaining · 1 done");
  });

  it("sinks lanes outside the milestone to the bottom and can hide them", () => {
    const d = detail([{ key: "X-1", team: "Alpha", epicKey: null, external: true, blocks: ["A-1"] }]);
    const shown = layoutTimeline(d, "team");
    expect(shown.lanes.map((l) => l.id)).toEqual(["Team A", "Team B", "Alpha"]);
    expect(shown.lanes[2]?.external).toBe(true);
    const hidden = layoutTimeline(d, "team", { showOutside: false });
    expect(hidden.lanes.map((l) => l.id)).toEqual(["Team A", "Team B"]);
    expect(hidden.cards.some((c) => c.item.key === "X-1")).toBe(false);
  });

  it("orders lanes by where the critical path reaches them", () => {
    // Team C's work starts the path, so its lane leads even though "Team A" sorts first.
    const d = detail([{ key: "C-1", team: "Team C", epicKey: null, blocks: ["A-1"] }]);
    expect(layoutTimeline(d, "team").lanes.map((l) => l.id)).toEqual(["Team C", "Team A", "Team B"]);
  });

  it("extends the columns to the latest start so slack never overflows", () => {
    const d = detail();
    const b2 = d.items.find((i) => i.key === "B-2");
    if (b2?.schedule) b2.schedule = { ...b2.schedule, latestStart: 4, slack: 4 };
    const layout = layoutTimeline(d, "team");
    expect(layout.columns).toBe(5);
    expect(layout.cards.find((c) => c.item.key === "B-2")?.slackX2).toBe(columnX(4) + CARD_WIDTH);
    expect(layout.width).toBeGreaterThanOrEqual(columnX(4) + CARD_WIDTH);
  });

  it("orders a cell's cards by the rows of their blockers", () => {
    // A longer chain elsewhere leaves Team B's work with slack, so only the
    // blockers' rows decide: B-0a sits above B-0z, so B-6 goes above B-5
    // although the keys alone would put B-5 first.
    const d = detail([
      { key: "D-1", team: "Team D", epicKey: null, blocks: ["D-2"] },
      { key: "D-2", team: "Team D", epicKey: null, blocks: ["D-3"] },
      { key: "D-3", team: "Team D", epicKey: null },
      { key: "B-0a", blocks: ["B-6"] },
      { key: "B-0z", blocks: ["B-5"] },
      { key: "B-5" },
      { key: "B-6" },
    ]);
    const layout = layoutTimeline(d, "team");
    const col = (n: number) => layout.cards.filter((c) => c.column === n && c.item.team === "Team B").map((c) => c.item.key);
    expect(col(0).slice(0, 2)).toEqual(["B-0a", "B-0z"]);
    expect(col(1).indexOf("B-6")).toBeLessThan(col(1).indexOf("B-5"));
  });

  describe("folding crowded cells", () => {
    const crowd = Array.from({ length: 11 }, (_, n) => ({ key: `B-${n + 10}` }));

    it("keeps the most important cards and folds the rest behind a pill", () => {
      const layout = layoutTimeline(detail(crowd), "team");
      const lane = layout.lanes.find((l) => l.id === "Team B");
      expect(lane?.collapsible).toBe(true);
      expect(lane?.expanded).toBe(false);
      const inNow = layout.cards.filter((c) => c.item.team === "Team B" && c.column === 0);
      expect(inNow).toHaveLength(CELL_LIMIT);
      expect(layout.overflows).toEqual([expect.objectContaining({ laneId: "Team B", column: 0, hidden: 12 - CELL_LIMIT })]);
      expect(layout.hiddenLane?.size).toBe(12 - CELL_LIMIT);
      expect([...(layout.hiddenLane?.values() ?? [])].every((l) => l === "Team B")).toBe(true);
      // Column counts include folded cards.
      expect(layout.columnStats?.[0]?.total).toBe(13);
      // Critical cards are never folded away.
      expect(layout.cards.some((c) => c.item.key === "A-1")).toBe(true);
    });

    it("never folds the pinned (selected) card or preferred matches", () => {
      const first = layoutTimeline(detail(crowd), "team");
      const hiddenKey = [...(first.hiddenLane?.keys() ?? [])][0] as string;
      const pinned = layoutTimeline(detail(crowd), "team", { pinnedKey: hiddenKey });
      expect(pinned.cards.some((c) => c.item.key === hiddenKey)).toBe(true);
      expect(pinned.hiddenLane?.size).toBe(12 - CELL_LIMIT);
      const preferred = layoutTimeline(detail(crowd), "team", { prefer: new Set([hiddenKey]) });
      expect(preferred.cards.some((c) => c.item.key === hiddenKey)).toBe(true);
    });

    it("shows everything in an expanded lane", () => {
      const layout = layoutTimeline(detail(crowd), "team", { expandedLanes: new Set(["Team B"]) });
      expect(layout.lanes.find((l) => l.id === "Team B")?.expanded).toBe(true);
      expect(layout.overflows).toEqual([]);
      expect(layout.cards.filter((c) => c.item.team === "Team B" && c.column === 0)).toHaveLength(12);
    });
  });
});

describe("chainOf", () => {
  it("collects upstream and downstream along unsatisfied links only", () => {
    const d = detail();
    expect([...chainOf("B-1", d.dependencies)].sort()).toEqual(["A-1", "B-1"]);
  });
});
