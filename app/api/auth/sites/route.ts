import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";

export async function GET() {
  const session = await getServerSession();

  if (!session.accessToken || !session.sites) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ sites: session.sites });
}
