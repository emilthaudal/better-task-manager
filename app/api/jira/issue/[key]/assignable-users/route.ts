import { NextRequest, NextResponse } from "next/server";
import { getAssignableUsers } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/** Users this issue can be assigned to, optionally narrowed by ?q= typeahead text. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  const query = req.nextUrl.searchParams.get("q") ?? undefined;

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const users = await getAssignableUsers(key, query, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(users);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
