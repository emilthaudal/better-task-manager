import { afterEach, describe, expect, it, vi } from "vitest";
import { cachePartition, compareIssueKeys, jwtSubject } from "@/lib/milestone";

describe("cache partition", () => {
  afterEach(() => vi.unstubAllEnvs());

  const jwt = (payload: object) =>
    ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

  it("reads the account id from an access token", () => {
    expect(jwtSubject(jwt({ sub: "5b10ac8d82e05b22cc7d4ef5" }))).toBe("5b10ac8d82e05b22cc7d4ef5");
    expect(jwtSubject(jwt({}))).toBeNull();
    expect(jwtSubject("not-a-jwt")).toBeNull();
  });

  it("uses the bypass site in local dev", async () => {
    vi.stubEnv("JIRA_BYPASS", "true");
    vi.stubEnv("JIRA_BASE_URL", "https://acme.atlassian.net");
    expect(await cachePartition()).toBe("bypass:https://acme.atlassian.net");
  });

  it("refuses to partition an unauthenticated request", async () => {
    vi.stubEnv("JIRA_BYPASS", "false");
    await expect(cachePartition({})).rejects.toThrow("Not authenticated");
  });
});

describe("compareIssueKeys", () => {
  it("orders like Jira's ORDER BY key: project, then issue number", () => {
    expect(["AS-142", "AS-52", "PLT-1", "AS-1000", "AS-9"].sort(compareIssueKeys)).toEqual([
      "AS-9",
      "AS-52",
      "AS-142",
      "AS-1000",
      "PLT-1",
    ]);
  });
});
