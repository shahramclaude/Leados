import { NextResponse } from "next/server";
import { db } from "@/db";
import { persistAutonomousRun } from "@/lib/autonomousPersist";

export const dynamic = "force-dynamic";

/**
 * POST /api/autonomous/trigger — manual "run now" for the in-app dashboard.
 * Runs the exact same cycle as the scheduled /api/autonomous/run cron
 * endpoint, just without the CRON_SECRET gate (this app has no end-user
 * auth system yet, so this is the same trust boundary as the rest of the
 * dashboard). Use /api/autonomous/run for the real external scheduler.
 */
export async function POST() {
  try {
    const result = await persistAutonomousRun(db, new Date());
    return NextResponse.json(result);
  } catch (err) {
    console.error("manual autonomous trigger failed", err);
    return NextResponse.json({ error: "Autonomous run failed" }, { status: 500 });
  }
}
