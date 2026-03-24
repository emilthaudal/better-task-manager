import { type NextRequest, NextResponse } from "next/server";
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
    return NextResponse.redirect(`${appUrl}/login?error=missing_token`);
  }

  let payload: HandoffPayload;
  try {
    payload = await unsealData<HandoffPayload>(token, {
      password: SESSION_PASSWORD,
      ttl: 60, // must match the TTL used when sealing in the callback
    });
  } catch {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_token`);
  }

  const { sessionData, destination } = payload;

  if (!sessionData?.accessToken) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_session`);
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

  // Seal the real session cookie. This response is a same-site first-party
  // request (browser followed: atlassian.com → vercel.app/callback → vercel.app/set-session)
  // and is now making a same-site request to vercel.app/set-session.
  // Browsers reliably store Set-Cookie on same-site responses.
  const sealed = await sealData(sessionData, {
    password: SESSION_PASSWORD,
    ttl: (sessionOptions.cookieOptions?.maxAge as number) ?? 60 * 60 * 24 * 7,
  });

  const response = NextResponse.redirect(safeDestination, { status: 302 });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");

  response.cookies.set(sessionOptions.cookieName, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // same-site context now — lax is correct and more compatible than none
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
