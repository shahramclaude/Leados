/**
 * GET /api/cockpit — single aggregate endpoint for the dashboard shell.
 * Fetches everything the UI needs in one round trip: the brain's current
 * findings, domain metrics, org physics snapshot, causal cascades, and
 * the most recent autonomous run record (if any).
 */

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { brainRuns } from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { load, count } from "@/lib/store";
import { project, run } from "@/lib/eventBrain";
import { detectCascades } from "@/lib/causalInference";
import { DOMAIN_KEYS, DOMAIN_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBaselineData();
    const [events, eventCount, lastRuns] = await Promise.all([
      load(),
      count(),
      db.select().from(brainRuns).orderBy(desc(brainRuns.runAt)).limit(1),
    ]);

    const now = new Date();
    const P = project(events, now);
    const findings = run(P, now);
    const cascades = detectCascades(P.ruleStates, now);

    const topFindings = findings.findings.slice(0, 8);

    return Response.json({
      ok: true,
      now: now.toISOString(),
      eventCount,
      domains: DOMAIN_KEYS.map((key) => ({ ...P.domainMetrics[key], label: DOMAIN_LABELS[key] })),
      orgHealthScore: findings.orgHealthScore,
      riskProfile: findings.riskProfile,
      dominantDomain: findings.dominantDomain,
      physicsSummary: findings.physicsSummary,
      uncertaintyCount: findings.uncertaintyCount,
      orgPhysics: P.orgPhysicsState,
      topFindings,
      totalFindings: findings.findings.length,
      cascades,
      hypotheses: P.hypotheses.slice(0, 10),
      lastAutonomousRun: lastRuns[0] ?? null,
    });
  } catch (err) {
    console.error("[api/cockpit]", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
