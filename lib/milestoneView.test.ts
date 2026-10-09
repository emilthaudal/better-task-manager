import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, layoutTimeline } from "@/lib/milestoneLayout";
import type { LaidOutCard, LaidOutEdge } from "@/lib/milestoneLayout";
import { fixtureDetail } from "@/lib/milestoneFixture";
import {
  DEFAULT_VIEW,
  chainIndex,
  cullWindow,
  matchItems,
  neighbor,
  parseViewState,
  samePayload,
  serializeViewState,
  visibleCards,
  visibleEdges,
} from "@/lib/milestoneView";
import type { Dependency, WorkItem } from "@/lib/milestoneTypes";

const card = (key: string, x: number, y: number): LaidOutCard => ({ item: { key } as WorkItem, x, y });

describe("view state in the URL", () => {
  it("round-trips non-default state and keeps unrelated params", () => {
    const params = serializeViewState(
      { tab: "insights", lanes: "team", item: "AS-12", query: "pricing api" },
      new URLSearchParams("fixture=multi"),
    );
    expect(params.get("fixture")).toBe("multi");
    expect(parseViewState(params)).toEqual({ tab: "insights", lanes: "team", item: "AS-12", query: "pricing api" });
  });

  it("omits defaults so links stay short", () => {
    expect(serializeViewState(DEFAULT_VIEW).toString()).toBe("");
  });

  it("ignores junk", () => {
    expect(parseViewState(new URLSearchParams("tab=x&lanes=y&item=<script>"))).toEqual(DEFAULT_VIEW);
    expect(parseViewState(new URLSearchParams("item=as-12")).item).toBe("AS-12");
  });
});

describe("matchItems", () => {
  const detail = fixtureDetail("multi");

  it("returns null for an empty query", () => {
    expect(matchItems(detail, "  ")).toBeNull();
  });

  it("matches key, team and assignee, requiring every term", () => {
    const first = detail.items[0] as WorkItem;
    expect(matchItems(detail, first.key.toLowerCase())?.has(first.key)).toBe(true);
    const platform = matchItems(detail, "platform");
    expect(platform?.size).toBe(detail.items.filter((i) => i.team === "Platform").length);
    const none = matchItems(detail, "platform zzzz-nothing");
    expect(none?.size).toBe(0);
  });
});

describe("chainIndex", () => {
  const dep = (from: string, to: string, satisfied = false): Dependency => ({
    from, to, kind: "item", crossTeam: false, crossEpic: false, satisfied, critical: false,
  });

  it("collects everything upstream and downstream over open links", () => {
    const chain = chainIndex([dep("A", "B"), dep("B", "C"), dep("X", "B"), dep("C", "D", true)]);
    expect([...chain("B")].sort()).toEqual(["A", "B", "C", "X"]);
    expect([...chain("A")].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("neighbor", () => {
  const cards = [card("A", 0, 0), card("B", 0, 100), card("C", 300, 90), card("D", 300, 400), card("E", 600, 0)];

  it("starts top-left when nothing is selected", () => {
    expect(neighbor(cards, null, "right")).toBe("A");
  });

  it("steps to the nearest column, closest row", () => {
    expect(neighbor(cards, "B", "right")).toBe("C");
    expect(neighbor(cards, "C", "right")).toBe("E");
    expect(neighbor(cards, "D", "left")).toBe("B");
    expect(neighbor(cards, "E", "right")).toBeNull();
  });

  it("moves within a column", () => {
    expect(neighbor(cards, "A", "down")).toBe("B");
    expect(neighbor(cards, "B", "up")).toBe("A");
    expect(neighbor(cards, "C", "down")).toBe("D");
    expect(neighbor(cards, "A", "up")).toBeNull();
  });
});

describe("culling", () => {
  it("snaps the window to tiles so small scrolls don't change it", () => {
    const a = cullWindow({ left: 10, top: 10, width: 800, height: 600 }, 1);
    const b = cullWindow({ left: 60, top: 12, width: 800, height: 600 }, 1);
    expect(a).toEqual(b);
  });

  it("accounts for zoom", () => {
    const r = cullWindow({ left: 1000, top: 0, width: 500, height: 500 }, 0.5, 0, 1);
    expect(r).toEqual({ x: 2000, y: 0, width: 1000, height: 1000 });
  });

  it("keeps only cards and edges touching the window", () => {
    const rect = { x: 0, y: 0, width: 500, height: 500 };
    const cards = [card("in", 100, 100), card("edge", 500 - CARD_WIDTH / 2, 0), card("out", 900, 900)];
    expect(visibleCards(cards, rect).map((c) => c.item.key)).toEqual(["in", "edge"]);
    const e = (x1: number, y1: number, x2: number, y2: number) => ({ dependency: {} as Dependency, x1, y1, x2, y2 }) as LaidOutEdge;
    // Crosses the window with both ends outside it.
    expect(visibleEdges([e(-100, 200, 900, 300), e(900, 900, 1200, 1000)], rect)).toHaveLength(1);
    expect(visibleCards(cards, null)).toHaveLength(3);
  });

  it("renders a fraction of a large milestone at laptop size", () => {
    const layout = layoutTimeline(fixtureDetail("large"), "epic");
    const rect = cullWindow({ left: 0, top: 0, width: 1280, height: 640 }, 1);
    const shown = visibleCards(layout.cards, rect).length;
    expect(layout.cards.length).toBeGreaterThan(250);
    expect(shown).toBeLessThan(layout.cards.length / 2);
    expect(CARD_HEIGHT).toBeGreaterThan(0);
  });
});

describe("samePayload", () => {
  it("ignores generatedAt only", () => {
    expect(samePayload({ a: 1, generatedAt: "x" }, { a: 1, generatedAt: "y" })).toBe(true);
    expect(samePayload({ a: 1, generatedAt: "x" }, { a: 2, generatedAt: "x" })).toBe(false);
  });
});
