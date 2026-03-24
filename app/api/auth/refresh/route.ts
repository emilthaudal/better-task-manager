import { NextResponse } from "next/server";
import { getServerSession, getAccessToken } from "@/lib/session";

export async function POST() {
  const session = await getServerSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  try {
    // getAccessToken handles the Atlassian token refresh and caches the result.
    // If the refresh token has been rotated, the new one is returned but we
    // don't persist it here — it will be picked up on the next full login.
    await getAccessToken(session.refreshToken);
    return NextResponse.json({ ok: true });
  } catch {
    // Refresh failed — destroy session so the proxy redirects to /login
    session.destroy();
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }
}
