import { NextRequest, NextResponse } from "next/server";
import { getMilestoneDetailCached } from "@/lib/milestone";
import { fixtureDetail, fixtureName } from "@/lib/milestoneFixture";
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
 *
 * Responses are cached per Jira site + project + release for 30 s, and
 * concurrent requests share one upstream fetch. `X-Cache` and `Server-Timing`
 * say which happened. Local dev only: `?fixture=multi|large` serves a
 * synthetic multi-team milestone.
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

  const fixture = fixtureName(req.nextUrl.searchParams.get("fixture"));
  if (fixture) return NextResponse.json(fixtureDetail(fixture), { headers: { "X-Cache": "fixture" } });

  const started = performance.now();
  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const { value, source } = await getMilestoneDetailCached(project, versionId, session);
    await persistRotatedToken(session, priorRefreshToken);
    const ms = (performance.now() - started).toFixed(1);
    return NextResponse.json(value, {
      headers: { "X-Cache": source, "Server-Timing": `milestone;desc="${source}";dur=${ms}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = isAuthError(message) ? 401 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
