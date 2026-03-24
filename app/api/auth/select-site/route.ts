import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import type { AtlassianSite } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (!session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { cloudId?: string };
  const { cloudId } = body;

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }

  // Fetch sites from Atlassian to validate the chosen cloudId.
  // sites are no longer stored in the session cookie (too large).
  const sitesRes = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
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
  await session.save();

  return NextResponse.json({ ok: true, site: validSite });
}
