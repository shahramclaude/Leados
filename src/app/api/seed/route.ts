import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/seedDemoData";

export const dynamic = "force-dynamic";

/** Idempotent demo-data seed: knowledge graph, institutional memory, hypotheses, a playbook mined from a retrospective, metrics and the whitepaper. */
export async function POST() {
  const result = await seedDemoData();
  return NextResponse.json({ ok: true, ...result });
}
