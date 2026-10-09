import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFixtureDetail, fixtureDetail, fixtureName } from "@/lib/milestoneFixture";

describe("milestone fixtures", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is deterministic so polls don't reshuffle the view", () => {
    const strip = (d: ReturnType<typeof buildFixtureDetail>) => ({ ...d, generatedAt: "" });
    expect(strip(buildFixtureDetail())).toEqual(strip(buildFixtureDetail()));
  });

  it("spans several teams with cross-team blockers", () => {
    const d = fixtureDetail("multi");
    expect(d.teams.length).toBeGreaterThanOrEqual(4);
    expect(d.items.length).toBeGreaterThanOrEqual(100);
    expect(d.dependencies.some((dep) => dep.crossTeam)).toBe(true);
    expect(d.criticalPath.length).toBeGreaterThan(3);
  });

  it("has a large variant with 250+ remaining items", () => {
    expect(fixtureDetail("large").items.filter((i) => i.schedule).length).toBeGreaterThan(250);
  });

  it("is only honoured in local dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JIRA_BYPASS", "false");
    expect(fixtureName("multi")).toBeNull();
    vi.stubEnv("JIRA_BYPASS", "true");
    expect(fixtureName("multi")).toBe("multi");
    expect(fixtureName("other")).toBeNull();
  });
});
