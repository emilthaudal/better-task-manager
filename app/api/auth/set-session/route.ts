import { type NextRequest } from "next/server";
import { unsealData, sealData } from "iron-session";
import { SESSION_PASSWORD, sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";

interface HandoffPayload {
  sessionData: SessionData;
  destination: string;
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");

  if (!token) {
    return Response.redirect(`${appUrl}/login?error=missing_token`);
  }

  let payload: HandoffPayload;
  try {
    payload = await unsealData<HandoffPayload>(token, {
      password: SESSION_PASSWORD,
      ttl: 60, // must match the TTL used when sealing in the callback
    });
  } catch {
    return Response.redirect(`${appUrl}/login?error=invalid_token`);
  }

  const { sessionData, destination } = payload;

  if (!sessionData?.refreshToken) {
    return Response.redirect(`${appUrl}/login?error=invalid_session`);
  }

  // Validate destination is same-origin to prevent open-redirect attacks
  const allowedOrigin = new URL(appUrl).origin;
  let safeDestination = `${appUrl}/app`;
  try {
    const destUrl = new URL(destination);
    if (destUrl.origin === allowedOrigin) {
      safeDestination = destination;
    }
  } catch {
    // destination was not a valid URL — fall back to /app
  }

  // Only store the minimal fields in the cookie — refreshToken + cloudId.
  // The access token is a large JWT (~1 KB) that pushes the sealed cookie
  // over the browser's 4096-byte hard limit. Access tokens are obtained
  // on demand via getAccessToken(refreshToken) which caches them in memory.
  const cookieSessionData: import("@/lib/session").SessionData = {
    refreshToken: sessionData.refreshToken,
    cloudId: sessionData.cloudId,
  };

  // Seal the real session cookie.
  const sealed = await sealData(cookieSessionData, {
    password: SESSION_PASSWORD,
    ttl: (sessionOptions.cookieOptions?.maxAge as number) ?? 60 * 60 * 24 * 7,
  });

  // IMPORTANT: We must return a 200 response here, NOT a 302 redirect.
  //
  // Browsers (Firefox ETP, Chrome with tracking protection) apply
  // SameSite/cross-site cookie restrictions to Set-Cookie headers that
  // appear on redirect responses mid-chain. A 302 from set-session would
  // still be considered part of the cross-site navigation that started at
  // atlassian.com, and the cookie may be silently dropped.
  //
  // A 200 terminal response ends the navigation. The browser commits the
  // page (and stores Set-Cookie) before following any script-driven redirect.
  // We use a <meta http-equiv="refresh"> + window.location so the cookie is
  // guaranteed to be stored before the next navigation begins.
  const cookieHeader = [
    `${sessionOptions.cookieName}=${sealed}`,
    "Path=/",
    `Max-Age=${60 * 60 * 24 * 7}`,
    "HttpOnly",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeDestination}" />
    <title>Signing in…</title>
  </head>
  <body>
    <script>window.location.replace(${JSON.stringify(safeDestination)})</script>
    <p>Signing in, please wait…</p>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": cookieHeader,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
