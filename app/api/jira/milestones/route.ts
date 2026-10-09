import { NextRequest, NextResponse } from "next/server";
import { getProgramOverview } from "@/lib/milestone";
import { getServerSession, persistRotatedToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function isAuthError(message: string): boolean {
  return message.includes("Not authenticated") || message.includes("Token refresh failed");
}

/** GET ?project=LAD — every release (milestone) in the delivery space, in order, with its increments. */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing required query param: project" }, { status: 400 });
  }

  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const overview = await getProgramOverview(project, session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: isAuthError(message) ? 401 : 500 });
  }
}
