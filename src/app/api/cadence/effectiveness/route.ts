import { NextResponse } from "next/server";
import { listEffectivenessForRitual } from "@/lib/cadence/effectiveness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ritualId = url.searchParams.get("ritualId");
  if (!ritualId) return NextResponse.json({ error: "ritualId query param is required" }, { status: 400 });
  const snapshots = await listEffectivenessForRitual(ritualId);
  return NextResponse.json({ ritualId, snapshots });
}
