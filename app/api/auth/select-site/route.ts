import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (!session.accessToken || !session.sites) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { cloudId?: string };
  const { cloudId } = body;

  if (!cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }

  const validSite = session.sites.find((s) => s.id === cloudId);
  if (!validSite) {
    return NextResponse.json({ error: "Invalid cloudId" }, { status: 400 });
  }

  session.cloudId = cloudId;
  await session.save();

  return NextResponse.json({ ok: true, site: validSite });
}
