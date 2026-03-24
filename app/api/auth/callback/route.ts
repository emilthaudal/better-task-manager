import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import { sessionOptions, SESSION_PASSWORD } from "@/lib/session";
import type { SessionData, AtlassianSite, AtlassianUser } from "@/lib/session";
import { OAUTH_STATE_COOKIE } from "@/app/api/auth/login/route";

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

  // Validate CSRF state from the plain cookie (not iron-session).
  // The state nonce was written as a plain HttpOnly cookie in the login route.
  const savedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  console.log("[callback] savedState:", savedState, "| state param:", state, "| cookie present:", !!savedState);

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      `${appUrl}/login?error=invalid_state&debug_has_cookie=${!!savedState}`,
    );
  }

  try {
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

    // Build the session data and seal it directly so we can write it via
    // response.cookies.set() — the same approach we use for the CSRF state.
    // Using getIronSession(req, NextResponse.redirect(...)) silently fails on
    // Vercel because the redirect response's Set-Cookie is dropped somewhere
    // in the middleware/CDN layer before it reaches the browser.
    const sessionData: SessionData = {
      accessToken,
      refreshToken,
      expiresAt,
      // Store only essential site fields to keep cookie size small
      sites: sites.map(({ id, name, url, avatarUrl }) => ({
        id,
        name,
        url,
        avatarUrl,
        scopes: [],
      })),
      user,
      cloudId: sites.length === 1 ? sites[0].id : undefined,
    };

    const sealed = await sealData(sessionData, {
      password: SESSION_PASSWORD,
      ttl: (sessionOptions.cookieOptions?.maxAge as number) ?? 60 * 60 * 24 * 7,
    });

    // Return a 200 HTML response instead of a 3xx redirect.
    // Vercel (and some CDNs) strip Set-Cookie headers from redirect responses
    // before they reach the browser, so the session cookie would be silently
    // dropped. A 200 response with a client-side redirect avoids this.
    const safeDestination = destination.replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeDestination}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>window.location.replace("${safeDestination}");</script>
    Redirecting…
  </body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    // Clear the CSRF state cookie — it's no longer needed
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    // Write the authenticated session cookie
    response.cookies.set(sessionOptions.cookieName, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", message);
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent(message)}`,
    );
  }
}
