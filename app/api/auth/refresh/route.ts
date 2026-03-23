import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET ?? "";

export async function POST() {
  const session = await getServerSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      refresh_token: session.refreshToken,
    }),
  });

  if (!tokenRes.ok) {
    // Refresh failed — clear session so middleware will redirect to /login
    session.destroy();
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  session.accessToken = data.access_token;
  if (data.refresh_token) {
    session.refreshToken = data.refresh_token;
  }
  session.expiresAt = Date.now() + data.expires_in * 1000;
  await session.save();

  return NextResponse.json({ ok: true });
}
