import { NextResponse } from "next/server";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const SCOPES = ["read:jira-work", "read:jira-user", "offline_access"].join(" ");

// Cookie name for the CSRF state nonce
export const OAUTH_STATE_COOKIE = "btm_oauth_state";

export async function GET() {
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

  const response = NextResponse.redirect(
    `https://auth.atlassian.com/authorize?${params.toString()}`,
  );

  // Store the CSRF state nonce as a plain cookie (not iron-session).
  // The state is not sensitive — it just needs to survive the round-trip
  // through Atlassian and back. A plain HttpOnly SameSite=Lax cookie is
  // the same approach used by NextAuth.js and Auth.js.
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes — long enough for the OAuth round-trip
  });

  return response;
}
