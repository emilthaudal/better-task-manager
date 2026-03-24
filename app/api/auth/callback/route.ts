import { NextRequest, NextResponse } from "next/server";
import { sealData } from "iron-session";
import { sessionOptions, SESSION_PASSWORD } from "@/lib/session";
import type { SessionData, AtlassianSite } from "@/lib/session";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET ?? "";

/**
 * Compute HMAC-SHA256 of `message` keyed with `secret`.
 * Returns a lowercase hex string.
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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
    console.error(
      "OAuth callback: missing ATLASSIAN_CLIENT_ID or ATLASSIAN_CLIENT_SECRET env vars",
    );
    return NextResponse.redirect(`${appUrl}/login?error=server_misconfigured`);
  }

  // Validate the CSRF state param via HMAC.
  // The login route generated state as "<nonce>.<hmac>" where hmac = HMAC-SHA256(nonce, SESSION_SECRET).
  // We recompute the HMAC here and compare — no cookie or server-side storage needed.
  const dotIndex = state.lastIndexOf(".");
  const nonce = dotIndex !== -1 ? state.slice(0, dotIndex) : "";
  const receivedHmac = dotIndex !== -1 ? state.slice(dotIndex + 1) : "";

  const sessionSecret =
    process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";
  const expectedHmac = await hmacSign(nonce, sessionSecret);

  if (!nonce || !safeEqual(receivedHmac, expectedHmac)) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
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
      return NextResponse.redirect(
        `${appUrl}/login?error=token_exchange_failed`,
      );
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

    // Fetch accessible Jira sites — needed only to determine destination
    // and set cloudId for single-site users. Not stored in the session cookie.
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

    // Determine redirect destination
    const destination =
      sites.length === 1 ? `${appUrl}/app` : `${appUrl}/select-site`;

    // Only store the minimum fields needed for authentication checks and API
    // calls. sites and user are intentionally excluded — they push the sealed
    // cookie well over the 4 KB browser limit and cause it to be silently
    // dropped. sites/user are fetched on demand from the Atlassian API instead.
    const sessionData: SessionData = {
      accessToken,
      refreshToken,
      expiresAt,
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
