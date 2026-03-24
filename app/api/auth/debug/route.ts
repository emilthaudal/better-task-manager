import { type NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import type { SessionData } from "@/lib/session";

const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? "dev-only-secret-replace-in-production-32ch";

export async function GET(req: NextRequest) {
  const cookieValue = req.cookies.get("btm_session")?.value;

  let sealStatus: string;
  let sessionKeys: string[] = [];

  if (!cookieValue) {
    sealStatus = "no_cookie";
  } else {
    try {
      const data = await unsealData<SessionData>(cookieValue, {
        password: SESSION_PASSWORD,
      });
      sessionKeys = Object.keys(data).filter(
        (k) => data[k as keyof SessionData] !== undefined,
      );
      sealStatus = "ok";
    } catch (err) {
      sealStatus =
        "unseal_failed: " +
        (err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    hasClientId: !!process.env.ATLASSIAN_CLIENT_ID,
    hasClientSecret: !!process.env.ATLASSIAN_CLIENT_SECRET,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    sessionSecretLen: process.env.SESSION_SECRET?.length ?? 0,
    hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "(not set)",
    nodeEnv: process.env.NODE_ENV,
    cookiePresent: !!cookieValue,
    cookieLen: cookieValue?.length ?? 0,
    sealStatus,
    sessionKeys,
  });
}
