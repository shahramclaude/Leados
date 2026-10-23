import { NextResponse } from "next/server";
import { getWisdomDashboard, recomputeWisdomStats } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getWisdomDashboard();
  return NextResponse.json({ stats });
}

export async function POST() {
  const stats = await recomputeWisdomStats();
  return NextResponse.json({ stats });
}
