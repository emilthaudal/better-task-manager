import { NextResponse } from "next/server";
import { getServerSession, getAccessToken, persistRotatedToken } from "@/lib/session";

export async function POST() {
  const session = await getServerSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const priorRefreshToken = session.refreshToken;
  try {
    // Atlassian rotates the refresh token on every use and invalidates the
    // old one, so the rotated token must be written back to the cookie here
    // — otherwise the next Lambda instance retries with a stale, already
    // -invalidated token and the refresh fails.
    const { refreshToken } = await getAccessToken(session.refreshToken);
    session.refreshToken = refreshToken;
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json({ ok: true });
  } catch {
    // Refresh failed — destroy session so the proxy redirects to /login
    session.destroy();
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }
}
