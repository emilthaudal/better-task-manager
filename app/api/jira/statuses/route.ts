import { NextRequest, NextResponse } from "next/server";
import { getProjectStatuses } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/** Every status reachable in the project's workflows, independent of which ones any issue currently sits in. */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const statuses = await getProjectStatuses(project, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(statuses);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
