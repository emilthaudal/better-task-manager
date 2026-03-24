import { NextResponse } from "next/server";
import { getServerSession, getAccessToken } from "@/lib/session";
import type { AtlassianUser } from "@/lib/session";

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

  const res = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 502 },
    );
  }

  const user = (await res.json()) as AtlassianUser;
  return NextResponse.json({ user, cloudId: session.cloudId });
}
