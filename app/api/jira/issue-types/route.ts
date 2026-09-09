import { NextRequest, NextResponse } from "next/server";
import { getCreateIssueTypes } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/** Issue types available for creating new issues in a project (excludes subtasks and epics). */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const types = await getCreateIssueTypes(project, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(types);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
