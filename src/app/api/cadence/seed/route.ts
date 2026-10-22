import { NextResponse } from "next/server";
import { seedDemoOrg } from "@/lib/cadence/demoSeed";

export const dynamic = "force-dynamic";

export async function POST() {
  const { orgId } = await seedDemoOrg();
  return NextResponse.json({ orgId });
}
