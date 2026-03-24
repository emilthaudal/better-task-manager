import { NextResponse } from "next/server";
import { getServerSession, getAccessToken } from "@/lib/session";
import type { AtlassianSite } from "@/lib/session";

export async function GET() {
  const session = await getServerSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let accessToken: string;
  try {
    ({ accessToken } = await getAccessToken(session.refreshToken));
  } catch {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }

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
    return NextResponse.json(
      { error: "Failed to fetch sites" },
      { status: 502 },
    );
  }

  const sites = (await res.json()) as AtlassianSite[];
  return NextResponse.json({ sites });
}
