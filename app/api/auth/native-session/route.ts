import { type NextRequest, NextResponse } from "next/server";
import { unsealData, sealData } from "iron-session";
import { SESSION_PASSWORD, sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";

interface HandoffPayload {
  sessionData: SessionData;
  destination: string;
}

/**
 * Native counterpart to /api/auth/set-session. Exchanges the short-lived
 * handoff token from the OAuth callback for the same sealed value that would
 * otherwise be set as the btm_session cookie — the app stores it in Keychain
 * and sends it back manually as a Cookie header on every request, since it
 * has no browser cookie jar to rely on.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  let payload: HandoffPayload;
  try {
    payload = await unsealData<HandoffPayload>(token, {
      password: SESSION_PASSWORD,
      ttl: 60, // must match the TTL used when sealing in the callback
    });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const { sessionData } = payload;
  if (!sessionData?.refreshToken) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  const cookieSessionData: SessionData = {
    refreshToken: sessionData.refreshToken,
    cloudId: sessionData.cloudId,
  };

  const sealed = await sealData(cookieSessionData, {
    password: SESSION_PASSWORD,
    ttl: (sessionOptions.cookieOptions?.maxAge as number) ?? 60 * 60 * 24 * 7,
  });

  return NextResponse.json({
    cookieName: sessionOptions.cookieName,
    cookieValue: sealed,
    needsSiteSelection: !sessionData.cloudId,
  });
}
