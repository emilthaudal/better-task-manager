import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, layoutTimeline } from "@/lib/milestoneLayout";
import type { LaidOutCard, LaidOutEdge } from "@/lib/milestoneLayout";
import { fixtureDetail } from "@/lib/milestoneFixture";
import {
  DEFAULT_VIEW,
  chainHasEdge,
  chainIndex,
  cullWindow,
  hasQuickFilter,
  toggleQuickFilter,
  matchItems,
  neighbor,
  parseViewState,
  readViewPrefs,
  samePayload,
  serializeViewState,
  teamMatrix,
  teamToken,
  visibleCards,
  viewPrefs,
  visibleEdges,
} from "@/lib/milestoneView";
import type { Dependency, WorkItem } from "@/lib/milestoneTypes";

const card = (key: string, x: number, y: number): LaidOutCard => ({ item: { key } as WorkItem, x, y });

describe("view state in the URL", () => {
  it("round-trips non-default state and keeps unrelated params", () => {
    const state = { tab: "teams", lanes: "epic", showDone: true, showOutside: false, item: "AS-12", query: "pricing api" } as const;
    const params = serializeViewState(state, new URLSearchParams("fixture=multi"));
    expect(params.get("fixture")).toBe("multi");
    expect(params.get("done")).toBe("1");
    expect(params.get("outside")).toBe("0");
    expect(parseViewState(params)).toEqual(state);
  });

  it("omits defaults so links stay short", () => {
    expect(serializeViewState(DEFAULT_VIEW).toString()).toBe("");
  });

  it("defaults to lanes by team, hiding done work and showing outside work", () => {
    expect(DEFAULT_VIEW).toMatchObject({ lanes: "team", showDone: false, showOutside: true });
  });

  it("ignores junk", () => {
    expect(parseViewState(new URLSearchParams("tab=x&lanes=y&item=<script>&done=yes"))).toEqual(DEFAULT_VIEW);
    expect(parseViewState(new URLSearchParams("item=as-12")).item).toBe("AS-12");
  });

  it("reads the old combined insights tab as Blockers", () => {
    expect(parseViewState(new URLSearchParams("tab=insights")).tab).toBe("blockers");
  });

  it("writes only the parts a page owns", () => {
    const params = serializeViewState({ ...DEFAULT_VIEW, tab: "ready", item: "AS-1" }, new URLSearchParams("tab=teams"), ["item", "query"]);
    expect(params.toString()).toBe("tab=teams&item=AS-1");
  });
});

describe("persisted view options", () => {
  it("fill in what the URL doesn't say", () => {
    const saved = readViewPrefs(JSON.stringify({ tab: "increments", lanes: "epic", showDone: true, showOutside: false }));
    expect(parseViewState(new URLSearchParams(""), saved)).toEqual({ ...DEFAULT_VIEW, tab: "increments", lanes: "epic", showDone: true, showOutside: false });
  });

  it("lose to the URL, so a shared link opens as sent", () => {
    const saved = readViewPrefs(JSON.stringify({ tab: "increments", lanes: "epic", showDone: true }));
    expect(parseViewState(new URLSearchParams("tab=path&lanes=team&done=0"), saved)).toMatchObject({ tab: "path", lanes: "team", showDone: false });
  });

  it("drop anything malformed", () => {
    expect(readViewPrefs("{not json")).toEqual({});
    expect(readViewPrefs(JSON.stringify({ tab: "nope", lanes: 3, showDone: "yes" }))).toEqual({});
    expect(readViewPrefs(null)).toEqual({});
  });

  it("are just the carry-over options", () => {
    expect(viewPrefs({ ...DEFAULT_VIEW, item: "AS-1", query: "x" })).toEqual({ tab: "path", lanes: "team", showDone: false, showOutside: true });
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

describe("quick filters", () => {
  const detail = fixtureDetail("multi");

  it("toggles is: tokens without touching the free text", () => {
    const on = toggleQuickFilter("pricing", "critical");
    expect(on).toBe("pricing is:critical");
    expect(hasQuickFilter(on, "critical")).toBe(true);
    expect(toggleQuickFilter(on, "critical")).toBe("pricing");
  });

  it("combines predicates with text", () => {
    const critical = matchItems(detail, "is:critical");
    expect(critical?.size).toBe(detail.items.filter((i) => i.schedule?.critical).length);
    const both = matchItems(detail, "is:ready is:unassigned");
    for (const k of both ?? []) {
      const item = detail.items.find((i) => i.key === k);
      expect(item?.schedule?.ready && !item.assignee).toBe(true);
    }
    const teamCritical = matchItems(detail, "is:critical checkout");
    expect([...(teamCritical ?? [])].every((k) => critical?.has(k))).toBe(true);
  });

  it("filters by exact team with team:<token>", () => {
    expect(teamToken("Team A ")).toBe("team-a");
    const platform = matchItems(detail, "team:platform is:cross");
    expect(platform?.size).toBeGreaterThan(0);
    for (const k of platform ?? []) {
      const item = detail.items.find((i) => i.key === k);
      expect(item?.team).toBe("Platform");
      expect(item?.schedule?.downstreamTeams.length).toBeGreaterThan(0);
    }
  });

  it("treats unknown is: tokens as text", () => {
    expect(matchItems(detail, "is:nonsense")?.size).toBe(0);
  });
});

describe("chainIndex", () => {
  const dep = (from: string, to: string, satisfied = false): Dependency => ({
    from, to, kind: "item", crossTeam: false, crossEpic: false, satisfied, critical: false,
  });

  it("collects everything upstream and downstream over open links", () => {
    const chain = chainIndex([dep("A", "B"), dep("B", "C"), dep("X", "B"), dep("C", "D", true)]);
    expect([...chain("B").members].sort()).toEqual(["A", "B", "C", "X"]);
    expect([...chain("A").members].sort()).toEqual(["A", "B", "C"]);
  });

  it("follows done links too when asked", () => {
    const chain = chainIndex([dep("A", "B"), dep("B", "C", true)], true);
    expect([...chain("A").members].sort()).toEqual(["A", "B", "C"]);
  });

  it("leaves out shortcut edges that bypass the focus", () => {
    const chain = chainIndex([dep("A", "B"), dep("B", "C"), dep("A", "C")])("B");
    expect(chainHasEdge(chain, "A", "B")).toBe(true);
    expect(chainHasEdge(chain, "B", "C")).toBe(true);
    expect(chainHasEdge(chain, "A", "C")).toBe(false);
  });

  it("tolerates cycles", () => {
    const chain = chainIndex([dep("A", "B"), dep("B", "A")])("A");
    expect([...chain.members].sort()).toEqual(["A", "B"]);
  });
});

describe("neighbor", () => {
  const cards = [card("A", 0, 0), card("B", 0, 100), card("C", 300, 90), card("D", 300, 400), card("E", 600, 0)];

  it("starts top-left when nothing is selected", () => {
    expect(neighbor(cards, null, "right")).toBe("A");
  });

  it("starts at the first critical card when there is one", () => {
    const critical = (key: string, x: number, y: number): LaidOutCard => ({
      item: { key, schedule: { critical: true } } as WorkItem,
      x,
      y,
    });
    expect(neighbor([...cards, critical("K", 600, 200), critical("J", 300, 500)], null, "down")).toBe("J");
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

describe("teamMatrix", () => {
  it("counts open cross-team links blocker → blocked, most blocking team first", () => {
    const d = fixtureDetail("multi");
    const m = teamMatrix(d);
    expect(m).not.toBeNull();
    if (!m) return;
    const total = Object.values(m.counts).flatMap((row) => Object.values(row)).reduce((a, b) => a + b, 0);
    const teamOf = new Map(d.items.map((i) => [i.key, i.team]));
    for (const e of d.epics) teamOf.set(e.key, e.team);
    const expected = d.dependencies.filter((x) => !x.satisfied && x.crossTeam && teamOf.get(x.from) !== teamOf.get(x.to)).length;
    expect(total).toBe(expected);
    const out = (t: string) => Object.values(m.counts[t] ?? {}).reduce((a, b) => a + b, 0);
    expect(out(m.teams[0] as string)).toBeGreaterThanOrEqual(out(m.teams[m.teams.length - 1] as string));
    for (const t of m.teams) expect(m.counts[t]?.[t]).toBeUndefined();
  });

  it("is null when no team waits on another", () => {
    const d = fixtureDetail("multi");
    expect(teamMatrix({ ...d, dependencies: d.dependencies.map((x) => ({ ...x, crossTeam: false })) })).toBeNull();
  });
});

describe("samePayload", () => {
  it("ignores generatedAt only", () => {
    expect(samePayload({ a: 1, generatedAt: "x" }, { a: 1, generatedAt: "y" })).toBe(true);
    expect(samePayload({ a: 1, generatedAt: "x" }, { a: 2, generatedAt: "x" })).toBe(false);
  });
});
