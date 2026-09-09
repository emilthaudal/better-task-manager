import { NextRequest, NextResponse } from "next/server";
import { canDeleteIssue, getIssueEditMeta, getIssueTransitions } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

/**
 * What this user is allowed to do to this issue, per Jira's own workflow and
 * permission scheme — the UI uses this to disable/hide controls instead of
 * maintaining its own permissions model.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const [transitions, editMeta, canDelete] = await Promise.all([
      getIssueTransitions(key, session),
      getIssueEditMeta(key, session),
      canDeleteIssue(key, session),
    ]);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json({
      transitions,
      editableFields: Object.keys(editMeta.fields),
      canDelete,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // A 403 here just means "no permissions to see" — treat as zero permissions, not a hard error.
    if (jiraErrorStatus(err) === 403) {
      return NextResponse.json({ transitions: [], editableFields: [], canDelete: false });
    }
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
