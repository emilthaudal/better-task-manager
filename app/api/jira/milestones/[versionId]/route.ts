import { NextRequest, NextResponse } from "next/server";
import { getMilestoneDetail } from "@/lib/milestone";
import { getServerSession, persistRotatedToken } from "@/lib/session";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthError(message: string): boolean {
  return message.includes("Not authenticated") || message.includes("Token refresh failed");
}

/**
 * GET /api/jira/milestones/{versionId}?project=LAD — one release's increments,
 * the team epics and work items delivering them, and the dependency analysis
 * (critical path, blocker epics, team load).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }
  if (!/^\d+$/.test(versionId)) {
    return NextResponse.json({ error: "versionId must be numeric" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const detail = await getMilestoneDetail(project, versionId, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = isAuthError(message) ? 401 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
