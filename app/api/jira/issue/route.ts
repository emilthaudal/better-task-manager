import { NextRequest, NextResponse } from "next/server";
import { createIssue } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/** Create a new issue. Body: { projectKey, issueTypeId, summary, description?, assigneeAccountId?, parentKey? }. */
export async function POST(req: NextRequest) {
  let body: {
    projectKey?: string;
    issueTypeId?: string;
    summary?: string;
    description?: string;
    assigneeAccountId?: string;
    parentKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectKey, issueTypeId, summary } = body;
  if (!projectKey || !issueTypeId || !summary) {
    return NextResponse.json(
      { error: "Request body must include projectKey, issueTypeId, and summary" },
      { status: 400 },
    );
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const created = await createIssue(
      {
        projectKey,
        issueTypeId,
        summary,
        description: body.description,
        assigneeAccountId: body.assigneeAccountId,
        parentKey: body.parentKey,
      },
      session,
    );
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
