import { NextRequest, NextResponse } from "next/server";
import { getProjectIssues } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function isAuthError(message: string): boolean {
  return (
    message.includes("Not authenticated") ||
    message.includes("Token refresh failed")
  );
}

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const issues = await getProjectIssues(project, session);

    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(issues);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (isAuthError(message)) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
