import { NextResponse } from "next/server";
import { getProjects } from "@/lib/jira";
import { getServerSession } from "@/lib/session";

export async function GET() {
  const session = await getServerSession();
  try {
    const projects = await getProjects(session);
    return NextResponse.json(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
