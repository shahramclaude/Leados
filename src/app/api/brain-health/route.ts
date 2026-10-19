/**
 * GET /api/brain-health — self-test suite for the event brain (NOT the
 * platform health check, which stays at /api/health and only pings the
 * database). Runs non-destructively against the live event log.
 */

import { ensureBaselineData } from "@/lib/seed";
import { load } from "@/lib/store";
import { runHealthSuite } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBaselineData();
    const events = await load();
    const checks = runHealthSuite(events, new Date());
    const allPass = checks.every((c) => c.pass);
    return Response.json({ ok: allPass, checks });
  } catch (err) {
    console.error("[api/brain-health]", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
