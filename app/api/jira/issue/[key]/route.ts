import { NextRequest, NextResponse } from "next/server";
import { deleteIssue, jiraFetch, updateIssue } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function jiraErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : "Unknown error";
  const statusMatch = message.match(/Jira API error (\d+)/);
  return statusMatch ? parseInt(statusMatch[1], 10) : 500;
}

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
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const data = await jiraFetch(`/issue/${encodeURIComponent(key)}?fields=${FIELDS}`, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}

/** Update editable fields on an issue. Caller should only send fields the issue's editmeta allows. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: "Missing issue key" }, { status: 400 });
  }

  let fields: Record<string, unknown>;
  try {
    const body = await req.json();
    fields = body?.fields;
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ error: "Request body must include a fields object" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    await updateIssue(key, fields, session);
    await persistRotatedToken(session, priorRefreshToken);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}

/** Permanently delete an issue. Irreversible — confirm on the client before calling this. */
export async function DELETE(
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
    await deleteIssue(key, session);
    await persistRotatedToken(session, priorRefreshToken);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: jiraErrorStatus(err) });
  }
}
