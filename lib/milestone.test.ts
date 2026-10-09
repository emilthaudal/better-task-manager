import { describe, expect, it } from "vitest";
import { compareIssueKeys } from "@/lib/milestone";

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
