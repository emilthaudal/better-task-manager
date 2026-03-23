import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const SCOPES = ["read:jira-work", "read:jira-user", "offline_access"].join(" ");

export async function GET(_req: NextRequest) {
  if (!ATLASSIAN_CLIENT_ID) {
    return NextResponse.json(
      { error: "ATLASSIAN_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ATLASSIAN_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  // Build the redirect response first, then attach the session cookie to it.
  // Using NextResponse.redirect + the (req, res) iron-session overload ensures
  // Set-Cookie is written onto the actual response that reaches the browser.
  const response = NextResponse.redirect(
    `https://auth.atlassian.com/authorize?${params.toString()}`,
  );

  const session = await getIronSession<SessionData>(_req, response, sessionOptions);
  session.oauthState = state;
  await session.save();

  return response;
}
