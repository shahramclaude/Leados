// Benchmark-only route: see PART-03-REPORT.md Phase 0/4. Issues the same 4
// reads as /api/dashboard/summary but awaits them one at a time, to produce a
// real measured "sequential waterfall" baseline. Never linked from the UI.

import { getDashboardSummarySequential } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = performance.now();
  const summary = await getDashboardSummarySequential();
  const durationMs = performance.now() - start;
  return Response.json({ ...summary, _timingMs: Math.round(durationMs) });
}
