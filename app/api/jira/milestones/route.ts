import { NextRequest, NextResponse } from "next/server";
import { getProgramOverviewCached } from "@/lib/milestone";
import { buildFixtureOverview, fixtureName } from "@/lib/milestoneFixture";
import { getServerSession, persistRotatedToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function isAuthError(message: string): boolean {
  return message.includes("Not authenticated") || message.includes("Token refresh failed");
}

/**
 * GET ?project=LAD — every release (milestone) in the delivery space, in order,
 * with its increments. Cached for 30 s per Jira site + project.
 */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  if (fixtureName(req.nextUrl.searchParams.get("fixture"))) {
    return NextResponse.json(buildFixtureOverview(), { headers: { "X-Cache": "fixture" } });
  }

  const started = performance.now();
  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const { value, source } = await getProgramOverviewCached(project, session);
    await persistRotatedToken(session, priorRefreshToken);
    const ms = (performance.now() - started).toFixed(1);
    return NextResponse.json(value, {
      headers: { "X-Cache": source, "Server-Timing": `overview;desc="${source}";dur=${ms}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: isAuthError(message) ? 401 : 500 });
  }
}
