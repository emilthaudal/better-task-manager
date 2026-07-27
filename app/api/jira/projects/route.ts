import { NextResponse } from "next/server";
import { getProjects } from "@/lib/jira";
import { getServerSession, persistRotatedToken } from "@/lib/session";

function isAuthError(message: string): boolean {
  return (
    message.includes("Not authenticated") ||
    message.includes("Token refresh failed")
  );
}

export async function GET() {
  const session = await getServerSession();
  const priorRefreshToken = session.refreshToken;
  try {
    const projects = await getProjects(session);
    await persistRotatedToken(session, priorRefreshToken);
    return NextResponse.json(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (isAuthError(message)) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
