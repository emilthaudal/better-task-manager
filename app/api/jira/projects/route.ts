import { NextResponse } from "next/server";
import { getProjects } from "@/lib/jira";
import { getServerSession } from "@/lib/session";

function isAuthError(message: string): boolean {
  return (
    message.includes("Not authenticated") ||
    message.includes("Token refresh failed")
  );
}

export async function GET() {
  const session = await getServerSession();
  try {
    const projects = await getProjects(session);
    return NextResponse.json(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (isAuthError(message)) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
