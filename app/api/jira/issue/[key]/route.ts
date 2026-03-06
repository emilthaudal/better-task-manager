import { NextRequest, NextResponse } from "next/server";
import { jiraFetch } from "@/lib/jira";

const FIELDS = [
  "summary",
  "status",
  "issuetype",
  "assignee",
  "priority",
  "labels",
  "description",
  "comment",
  "issuelinks",
  "parent",
  "subtasks",
  "customfield_10016", // story points (classic)
  "customfield_10028", // story points (next-gen)
].join(",");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  try {
    const data = await jiraFetch(`/issue/${encodeURIComponent(key)}?fields=${FIELDS}`);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Surface Jira API errors with the original status code when possible
    const statusMatch = message.match(/Jira API error (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
