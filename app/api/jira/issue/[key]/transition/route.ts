import { NextRequest, NextResponse } from "next/server";
import { transitionIssue } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/** Move an issue to a new status. Body: { transitionId: string } (from GET .../permissions). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  let transitionId: string;
  try {
    const body = await req.json();
    transitionId = body?.transitionId;
    if (!transitionId || typeof transitionId !== "string") {
      return NextResponse.json({ error: "Request body must include transitionId" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    await transitionIssue(key, transitionId, session);
    await persistRotatedToken(session, priorRefreshToken);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
