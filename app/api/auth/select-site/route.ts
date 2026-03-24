import { NextRequest, NextResponse } from "next/server";
import { getServerSession, getAccessToken } from "@/lib/session";
import type { AtlassianSite } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { cloudId?: string };
  const { cloudId } = body;

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getAccessToken(session.refreshToken));
  } catch {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }

  // Fetch sites from Atlassian to validate the chosen cloudId.
  const sitesRes = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!sitesRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch sites" },
      { status: 502 },
    );
  }

  const sites = (await sitesRes.json()) as AtlassianSite[];
  const validSite = sites.find((s) => s.id === cloudId);
  if (!validSite) {
    return NextResponse.json({ error: "Invalid cloudId" }, { status: 400 });
  }

  session.cloudId = cloudId;
  session.siteUrl = validSite.url;
  await session.save();

  return NextResponse.json({ ok: true, site: validSite });
}
