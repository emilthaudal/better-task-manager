import { NextRequest, NextResponse } from "next/server";
import { getEpicChildren, getSubtasks } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function isAuthError(message: string): boolean {
  return (
    message.includes("Not authenticated") ||
    message.includes("Token refresh failed")
  );
}

export async function GET(req: NextRequest) {
  const epic = req.nextUrl.searchParams.get("epic");
  if (!epic) {
    return NextResponse.json({ error: "Missing required query param: epic" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    // Level 1: direct children of the epic
    const children = await getEpicChildren(epic, session);

    // Level 2: subtasks of those children
    const nonSubtaskKeys = children
      .filter((i) => !i.fields.issuetype.subtask)
      .map((i) => i.key);

    const subtasks = await getSubtasks(nonSubtaskKeys, session);

    // Combine, deduplicate by key
    const allIssues = [...children, ...subtasks];
    const seen = new Set<string>();
    const deduped = allIssues.filter((i) => {
      if (seen.has(i.key)) return false;
      seen.add(i.key);
      return true;
    });

    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(deduped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (isAuthError(message)) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
