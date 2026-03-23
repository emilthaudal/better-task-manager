import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { cookies } from "next/headers";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const SCOPES = [
  "read:jira-work",
  "read:jira-user",
  "offline_access",
].join(" ");

export async function GET(_req: NextRequest) {
  if (!ATLASSIAN_CLIENT_ID) {
    return NextResponse.json(
      { error: "ATLASSIAN_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Generate a random state nonce for CSRF protection
  const state = crypto.randomUUID();

  // Store state in session before redirect
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  session.oauthState = state;
  await session.save();

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ATLASSIAN_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  return NextResponse.redirect(
    `https://auth.atlassian.com/authorize?${params.toString()}`,
  );
}
