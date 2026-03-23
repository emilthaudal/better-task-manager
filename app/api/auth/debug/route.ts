import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasClientId: !!process.env.ATLASSIAN_CLIENT_ID,
    hasClientSecret: !!process.env.ATLASSIAN_CLIENT_SECRET,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    sessionSecretLen: process.env.SESSION_SECRET?.length ?? 0,
    hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "(not set)",
    nodeEnv: process.env.NODE_ENV,
  });
}
