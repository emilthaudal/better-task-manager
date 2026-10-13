import { describe, expect, it } from "vitest";
import { buildFixtureOverview, fixtureDetail } from "@/lib/milestoneFixture";
import {
  blockingOtherTeams,
  epicSpan,
  filterBlockers,
  filterIncrements,
  filterWarnings,
  incrementLinks,
  isSevere,
  landingMilestone,
  levelTitle,
  loadInsight,
  matchesIncrement,
  outOfOrderBlockers,
  parseJiraDate,
  rankMatches,
  releaseState,
  releaseStateLabel,
  scheduleSummary,
  severeCount,
  sortTeams,
  sortedKeys,
  waitingOnOtherTeams,
  warningTitle,
  warningsDetail,
} from "@/lib/milestoneInsights";
import { matchItems } from "@/lib/milestoneView";
import type { IncrementSummary, MilestoneWarning, ProgramOverview, ProgramRelease, TeamSummary } from "@/lib/milestoneTypes";

const STATUS = { name: "To Do", category: "new" } as const;

const inc = (key: string, blockedBy: string[] = []): IncrementSummary => ({
  key,
  summary: key,
  status: STATUS,
  team: null,
  capabilities: [],
  teamEpics: [],
  blocks: [],
  blockedBy,
});

const release = (id: string, sequence: number, increments: IncrementSummary[], released = false): ProgramRelease => ({
  id,
  name: id,
  description: null,
  released,
  archived: false,
  startDate: null,
  releaseDate: null,
  overdue: false,
  sequence,
  increments,
  progress: { done: 0, inProgress: 0, todo: 0, total: 0 },
  epicProgress: { done: 0, inProgress: 0, todo: 0, total: 0 },
});

const program = (releases: ProgramRelease[], unscheduled: IncrementSummary[] = []): ProgramOverview => ({
  project: { key: "LAD", name: "Delivery" },
  releases,
  unscheduled,
  warnings: [],
  generatedAt: "",
});

describe("warning severity", () => {
  it("treats plan-breaking kinds as severe, hygiene as not", () => {
    for (const kind of ["cycle", "out-of-order-dependency", "external-blocker", "unassigned-critical"]) expect(isSevere(kind)).toBe(true);
    for (const kind of ["undeclared-dependency", "unbacked-dependency", "no-team-epics", "unscheduled", "something-new"]) expect(isSevere(kind)).toBe(false);
  });

  it("words the header tile like the mac app", () => {
    const w = (kind: MilestoneWarning["kind"]): MilestoneWarning => ({ kind, message: "", keys: [] });
    expect(warningsDetail([w("unscheduled"), w("no-team-epics")])).toBe("nothing severe");
    expect(warningsDetail([w("cycle")])).toBe("1 needs attention");
    expect(warningsDetail([w("cycle"), w("external-blocker"), w("unscheduled")])).toBe("2 need attention");
    expect(severeCount([w("cycle"), w("unscheduled")])).toBe(1);
  });

  it("titles unknown kinds from their slug", () => {
    expect(warningTitle("cycle")).toBe("Dependency cycle");
    expect(warningTitle("stale-estimate")).toBe("Stale Estimate");
  });

  it("sorts keys naturally and drops duplicates", () => {
    expect(sortedKeys(["LAD-10", "LAD-9", "AS-2", "LAD-9"])).toEqual(["AS-2", "LAD-9", "LAD-10"]);
  });
});

describe("release state", () => {
  it("reads Jira dates as local calendar days", () => {
    const d = parseJiraDate("2026-12-15");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate()]).toEqual([2026, 11, 15]);
    expect(parseJiraDate(null)).toBeNull();
    expect(parseJiraDate("soon")).toBeNull();
  });

  it("prefers released, then overdue, then the date", () => {
    expect(releaseState({ released: true, overdue: true, releaseDate: "2026-01-01" }).kind).toBe("released");
    expect(releaseState({ released: false, overdue: true, releaseDate: "2026-01-01" }).kind).toBe("overdue");
    expect(releaseState({ released: false, overdue: false, releaseDate: "2026-01-01" }).kind).toBe("due");
    expect(releaseStateLabel(releaseState({ released: false, overdue: false, releaseDate: null }))).toBe("No date");
  });
});

describe("out-of-order blockers", () => {
  it("flags blockers that ship later or in no milestone", () => {
    const p = program(
      [release("1", 0, [inc("A", ["B", "U", "X"])]), release("2", 1, [inc("B"), inc("C", ["A"])])],
      [inc("U")],
    );
    const late = outOfOrderBlockers(p);
    // X isn't known to the program — that's the server's warning to raise.
    expect(late.get("A")).toEqual(["B", "U"]);
    expect(late.has("C")).toBe(false);
  });

  it("accepts blockers that ship earlier or alongside", () => {
    // The fixture's third milestone waits on LAD-21, which ships in the second.
    expect(outOfOrderBlockers(buildFixtureOverview()).size).toBe(0);
  });
});

describe("landing milestone", () => {
  const p = program([release("1", 0, [], true), release("2", 1, []), release("3", 2, [])]);

  it("returns to the last milestone viewed", () => {
    expect(landingMilestone(p, "3")).toBe("3");
  });

  it("otherwise opens the next one to ship", () => {
    expect(landingMilestone(p, null)).toBe("2");
    expect(landingMilestone(p, "gone")).toBe("2");
    expect(landingMilestone(program([release("1", 0, [], true)]), null)).toBe("1");
    expect(landingMilestone(program([]), null)).toBeNull();
  });
});

describe("increment link evidence", () => {
  it("classifies declared, derived and both, declared first", () => {
    expect(incrementLinks(["A", "B"], ["B", "C"])).toEqual([
      { key: "A", evidence: "declared-only" },
      { key: "B", evidence: "declared-and-backed" },
      { key: "C", evidence: "derived-only" },
    ]);
    expect(incrementLinks([], [])).toEqual([]);
  });
});

describe("search as go-to", () => {
  const detail = fixtureDetail("multi");

  it("ranks critical matches first, then the earliest start", () => {
    const matches = matchItems(detail, "");
    expect(rankMatches(detail, matches, { showDone: false, showOutside: true })).toEqual([]);
    const all = new Set(detail.items.map((i) => i.key));
    const ranked = rankMatches(detail, all, { showDone: false, showOutside: true });
    const byKey = new Map(detail.items.map((i) => [i.key, i]));
    const firstNonCritical = ranked.findIndex((k) => !byKey.get(k)?.schedule?.critical);
    expect(ranked.slice(0, firstNonCritical).every((k) => byKey.get(k)?.schedule?.critical)).toBe(true);
    expect(ranked.slice(firstNonCritical).some((k) => byKey.get(k)?.schedule?.critical)).toBe(false);
    const starts = ranked.slice(firstNonCritical).map((k) => byKey.get(k)?.schedule?.earliestStart ?? 0);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("skips done work and outside work unless shown", () => {
    const all = new Set(detail.items.map((i) => i.key));
    const byKey = new Map(detail.items.map((i) => [i.key, i]));
    const hidden = rankMatches(detail, all, { showDone: false, showOutside: false });
    expect(hidden.every((k) => byKey.get(k)?.schedule && !byKey.get(k)?.external)).toBe(true);
    const shown = rankMatches(detail, all, { showDone: true, showOutside: true });
    expect(shown.length).toBe(detail.items.length);
    // Done items have no schedule, so they come last.
    expect(byKey.get(shown[shown.length - 1] ?? "")?.schedule).toBeNull();
  });
});

describe("filters on every tab", () => {
  const detail = fixtureDetail("multi");

  it("keeps everything without a query", () => {
    expect(filterBlockers(detail, "").length).toBe(detail.blockerEpics.length);
    expect(filterIncrements(detail, " ").length).toBe(detail.increments.length);
    expect(filterWarnings(detail, detail.warnings, "")).toBe(detail.warnings);
  });

  it("matches blocker epics by their own text and keeps their rank", () => {
    const target = detail.blockerEpics[1];
    const rows = filterBlockers(detail, target?.epicKey ?? "");
    expect(rows.map((r) => r.blocker.epicKey)).toContain(target?.epicKey);
    expect(rows.find((r) => r.blocker.epicKey === target?.epicKey)?.rank).toBe(2);
  });

  it("matches epics and increments through their items for is: filters", () => {
    const rows = filterBlockers(detail, "is:critical");
    const critical = new Set(detail.items.filter((i) => i.schedule?.critical).map((i) => i.epicKey));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => critical.has(r.blocker.epicKey))).toBe(true);
    const incs = filterIncrements(detail, "team:checkout");
    const viaCheckout = new Set(detail.items.filter((i) => i.team === "Checkout").map((i) => i.incrementKey));
    expect(incs.every((i) => viaCheckout.has(i.key))).toBe(true);
  });

  it("matches increments by capability", () => {
    const capability = detail.increments[0]?.capabilities[0];
    expect(filterIncrements(detail, capability?.key ?? "").map((i) => i.key)).toContain(detail.increments[0]?.key);
    expect(filterIncrements(detail, "zzzz-nothing")).toEqual([]);
  });

  it("matches warnings by text or by their keys' items", () => {
    const warnings: MilestoneWarning[] = [
      { kind: "external-blocker", message: "FIN-12 blocks work", keys: ["FIN-12"] },
      { kind: "unscheduled", message: "Nothing here", keys: [] },
    ];
    expect(filterWarnings(detail, warnings, "blocked from outside").length).toBe(1);
    expect(filterWarnings(detail, warnings, "is:outside").map((w) => w.keys)).toEqual([["FIN-12"]]);
  });

  it("matches roadmap increments by text over capabilities and epics", () => {
    const i = { ...inc("LAD-1"), capabilities: [{ key: "LA-1", summary: "Price agreements", status: STATUS }] };
    expect(matchesIncrement(i, "price")).toBe(true);
    expect(matchesIncrement(i, "price lad-1")).toBe(true);
    expect(matchesIncrement(i, "payments")).toBe(false);
  });
});

describe("teams", () => {
  const team = (over: Partial<TeamSummary>): TeamSummary => ({
    name: "T",
    epicKeys: [],
    progress: { done: 0, inProgress: 0, todo: 0, total: 0 },
    remaining: 0,
    criticalItems: 0,
    readyNow: 0,
    unassignedRemaining: 0,
    waitingOnOtherTeams: 0,
    blockingOtherTeams: 0,
    loadByLevel: [],
    criticalByLevel: [],
    ...over,
  });

  it("sorts by critical work, then remaining", () => {
    const sorted = sortTeams([team({ name: "A", remaining: 9 }), team({ name: "B", criticalItems: 1, remaining: 1 }), team({ name: "C", remaining: 12 })]);
    expect(sorted.map((t) => t.name)).toEqual(["B", "C", "A"]);
  });

  it("says one useful thing about the load", () => {
    expect(loadInsight(team({ remaining: 0 }))).toBeNull();
    expect(loadInsight(team({ remaining: 4, blockingOtherTeams: 2, loadByLevel: [4] }))).toMatch(/Holds up 2 items/);
    expect(loadInsight(team({ remaining: 6, loadByLevel: [1, 4, 1] }))).toBe("Load peaks at Step 2 (4 items) — consider spreading it.");
    expect(loadInsight(team({ remaining: 6, loadByLevel: [2, 2, 2], unassignedRemaining: 1, criticalItems: 1 }))).toBe("Has critical work with no assignee.");
  });

  it("lists cross-team work both ways", () => {
    const detail = fixtureDetail("multi");
    const byKey = new Map(detail.items.map((i) => [i.key, i]));
    for (const t of detail.teams) {
      for (const item of blockingOtherTeams(detail, t.name)) {
        expect(item.blocks.some((k) => byKey.get(k) && byKey.get(k)?.team !== t.name && byKey.get(k)?.status.category !== "done")).toBe(true);
      }
      for (const item of waitingOnOtherTeams(detail, t.name)) {
        expect(item.blockedBy.some((k) => byKey.get(k) && byKey.get(k)?.team !== t.name)).toBe(true);
      }
    }
    expect(detail.teams.some((t) => blockingOtherTeams(detail, t.name).length > 0)).toBe(true);
  });
});

describe("wording", () => {
  it("names steps and spans", () => {
    expect(levelTitle(0)).toBe("Now");
    expect(levelTitle(3)).toBe("Step 4");
    expect(epicSpan({ earliestStart: 0, earliestFinish: 3 })).toBe("Now → Step 3");
    expect(epicSpan({ earliestStart: null, earliestFinish: null })).toBeNull();
  });

  it("summarises a schedule", () => {
    const base = { earliestFinish: 1, latestStart: 0, critical: true, downstream: 0, downstreamTeams: [] };
    expect(scheduleSummary({ ...base, earliestStart: 0, slack: 0, ready: true })).toBe("Can start now · on the critical path");
    expect(scheduleSummary({ ...base, earliestStart: 2, slack: 1, ready: false, critical: false })).toBe("Starts after 2 steps · 1 step of slack");
  });
});
