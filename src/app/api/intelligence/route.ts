/**
 * GET /api/intelligence — runs the event-sourced brain (project + run)
 * against the full persisted event log and returns the current
 * BrainFindings, including cross-domain causal cascades.
 */

import { ensureBaselineData } from "@/lib/seed";
import { load } from "@/lib/store";
import { project, run } from "@/lib/eventBrain";
import { detectCascades } from "@/lib/causalInference";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBaselineData();
    const events = await load();
    const now = new Date();
    const P = project(events, now);
    const findings = run(P, now);
    const cascades = detectCascades(P.ruleStates, now);

    return Response.json({
      ok: true,
      now: now.toISOString(),
      eventCount: events.length,
      findings,
      ruleStates: P.ruleStates,
      domainMetrics: P.domainMetrics,
      orgPhysics: P.orgPhysicsState,
      hypotheses: P.hypotheses,
      knowledgeLinks: P.knowledgeLinks,
      cascades,
    });
  } catch (err) {
    console.error("[api/intelligence]", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
