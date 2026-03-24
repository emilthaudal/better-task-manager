import { NextResponse } from "next/server";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const SCOPES = ["read:jira-work", "read:jira-user", "offline_access"].join(" ");

/**
 * Compute HMAC-SHA256 of `message` keyed with `secret`.
 * Returns a lowercase hex string.
 * Uses the Web Crypto API which is available in both Node.js and Edge runtimes.
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

export async function GET() {
  if (!ATLASSIAN_CLIENT_ID) {
    return NextResponse.json(
      { error: "ATLASSIAN_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Generate a random nonce and sign it with SESSION_SECRET.
  // The state param sent to Atlassian is "<nonce>.<hmac>".
  // The callback verifies the HMAC — no cookie or server-side storage needed.
  const nonce = crypto.randomUUID();
  const sessionSecret =
    process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";
  const hmac = await hmacSign(nonce, sessionSecret);
  const state = `${nonce}.${hmac}`;

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ATLASSIAN_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  // Return a 200 HTML response instead of a 3xx redirect.
  // Vercel strips Set-Cookie headers from redirect responses before they reach
  // the browser. A 200 response is reliable; the browser navigates to
  // Atlassian via window.location.replace() / <meta http-equiv="refresh">.
  // No cookie is set — state validation is done via the HMAC in the state param.
  const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
  const safeUrl = authUrl.replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeUrl}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>window.location.replace("${safeUrl}");</script>
    Redirecting…
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
