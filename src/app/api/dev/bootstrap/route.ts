import { NextResponse } from "next/server";
import { seedDemoWorld } from "@/lib/dev-seed";

export const dynamic = "force-dynamic";

// DEV ONLY (see registry.json). Idempotent: safe to call repeatedly.
export async function POST() {
  const summary = await seedDemoWorld();
  return NextResponse.json({ ok: true, orgs: summary });
}
