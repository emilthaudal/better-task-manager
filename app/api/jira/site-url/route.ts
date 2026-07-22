import { NextResponse } from "next/server";
import { getServerSession, getAccessToken, isAuthenticated, persistRotatedToken } from "@/lib/session";
import type { AtlassianSite } from "@/lib/session";

export async function GET() {
  const session = await getServerSession();

  if (!isAuthenticated(session)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fast path: siteUrl already stored in session (set by select-site after this deploy).
  if (session.siteUrl) {
    return NextResponse.json({ url: session.siteUrl });
  }

  // JIRA_BYPASS path (local dev).
  if (process.env.JIRA_BYPASS === "true") {
    return NextResponse.json({ url: process.env.JIRA_BASE_URL ?? "" });
  }

  // Fallback for existing sessions that predate siteUrl storage:
  // re-fetch the accessible-resources list and match by cloudId, then persist.
  const priorRefreshToken = session.refreshToken;
  try {
    const { accessToken, refreshToken } = await getAccessToken(session.refreshToken!);
    session.refreshToken = refreshToken;

    const res = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      await persistRotatedToken(session, priorRefreshToken);
      return NextResponse.json({ url: "" });
    }

    const sites = (await res.json()) as AtlassianSite[];
    const site = sites.find((s) => s.id === session.cloudId);
    const url = site?.url ?? "";

    if (url) {
      // Backfill into the session so subsequent requests hit the fast path.
      session.siteUrl = url;
      await session.save();
    } else {
      await persistRotatedToken(session, priorRefreshToken);
    }

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: "" });
  }
}
