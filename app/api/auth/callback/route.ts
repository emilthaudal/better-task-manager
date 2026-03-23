import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData, AtlassianSite, AtlassianUser } from "@/lib/session";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_params`);
  }

  if (!ATLASSIAN_CLIENT_ID || !ATLASSIAN_CLIENT_SECRET) {
    console.error("OAuth callback: missing ATLASSIAN_CLIENT_ID or ATLASSIAN_CLIENT_SECRET env vars");
    return NextResponse.redirect(`${appUrl}/login?error=server_misconfigured`);
  }

  try {
    // Read the session from the incoming request cookie to validate CSRF state.
    // We use a temporary response just to satisfy the (req, res) overload —
    // we'll build the real redirect response later and re-attach the session.
    const tempRes = new NextResponse();
    const session = await getIronSession<SessionData>(req, tempRes, sessionOptions);

    if (!session.oauthState || session.oauthState !== state) {
      return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
    }

    // Exchange authorization code for tokens
    const redirectUri = `${appUrl}/api/auth/callback`;

    const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: ATLASSIAN_CLIENT_ID,
        client_secret: ATLASSIAN_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Token exchange failed:", body);
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    // Fetch accessible Jira sites
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
      return NextResponse.redirect(`${appUrl}/login?error=sites_fetch_failed`);
    }

    const sites = (await sitesRes.json()) as AtlassianSite[];

    // Fetch user identity
    const meRes = await fetch("https://api.atlassian.com/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    let user: AtlassianUser | undefined;
    if (meRes.ok) {
      user = (await meRes.json()) as AtlassianUser;
    }

    // Determine redirect destination
    const destination =
      sites.length === 1 ? `${appUrl}/` : `${appUrl}/select-site`;

    // Build the final redirect response and write the session onto it
    const response = NextResponse.redirect(destination);
    const finalSession = await getIronSession<SessionData>(req, response, sessionOptions);

    finalSession.accessToken = accessToken;
    finalSession.refreshToken = refreshToken;
    finalSession.expiresAt = expiresAt;
    // Store only essential site fields to keep cookie size small
    finalSession.sites = sites.map(({ id, name, url, avatarUrl }) => ({
      id,
      name,
      url,
      avatarUrl,
      scopes: [],
    }));
    finalSession.user = user;
    finalSession.oauthState = undefined;
    finalSession.cloudId = sites.length === 1 ? sites[0].id : undefined;
    await finalSession.save();

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", message);
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent(message)}`,
    );
  }
}
