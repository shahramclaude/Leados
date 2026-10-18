import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leados_autonomous_runs } from "@/db/schema";
import type { AutonomousRunSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/autonomous/runs — the last 20 autonomous run summaries. */
export async function GET() {
  const rows = await db
    .select()
    .from(leados_autonomous_runs)
    .orderBy(desc(leados_autonomous_runs.ranAt))
    .limit(20);

  const runs: AutonomousRunSummary[] = rows.map((r) => {
    const snapshot = (r.snapshot ?? {}) as { summary?: string };
    return {
      id: r.id,
      ranAt: r.ranAt.toISOString(),
      findingsCount: r.findingsCount,
      actionsTaken: r.actionsTaken,
      escalations: r.escalations,
      durationMs: r.durationMs,
      summary: snapshot.summary ?? "",
    };
  });

  return NextResponse.json({ runs });
}
