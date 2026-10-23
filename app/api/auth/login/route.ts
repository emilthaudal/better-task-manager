import { NextRequest, NextResponse } from "next/server";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID ?? "";
const SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "offline_access",
].join(" ");

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

export async function GET(req: NextRequest) {
  if (!ATLASSIAN_CLIENT_ID) {
    return NextResponse.json(
      { error: "ATLASSIAN_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;

  // "native" for the macOS app's ASWebAuthenticationSession flow — the callback
  // reads this back out of `state` to hand off via a custom URL scheme instead
  // of a browser cookie. Anything else is treated as the ordinary web flow.
  const client = new URL(req.url).searchParams.get("client") === "native" ? "native" : "web";

  // Generate a random nonce and sign it (with the client flag) using SESSION_SECRET.
  // The state param sent to Atlassian is "<nonce>.<client>.<hmac>".
  // The callback verifies the HMAC — no cookie or server-side storage needed.
  const nonce = crypto.randomUUID();
  const sessionSecret =
    process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";
  const hmac = await hmacSign(`${nonce}.${client}`, sessionSecret);
  const state = `${nonce}.${client}.${hmac}`;

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ATLASSIAN_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authUrl, { status: 302 });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}
