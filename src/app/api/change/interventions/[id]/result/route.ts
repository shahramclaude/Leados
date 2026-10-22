import { getIntervention } from "@/lib/change/repository";
import { getProgramPeriodObservations } from "@/lib/change/dashboard";
import { estimateInterventionEffect, recordInterventionResult } from "@/lib/change/interventionEffect";
import { saveInterventionResult } from "@/lib/change/repository";
import type { DesignIdentification } from "@/lib/stats/estimators";

export const dynamic = "force-dynamic";

/**
 * Intervention Lab — "track result vs expectation". Estimates the
 * intervention's effect on the adoption-proxy rate from the event log using
 * the intervention's own rollout design, then records the estimate next to
 * the originally declared expectation (closing the loop, per Part 23's
 * decision-journal pattern).
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const intervention = await getIntervention(id);
  if (!intervention) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (!intervention.rolloutDesign) {
    return Response.json({ ok: false, error: "intervention has no rollout design to estimate against" }, { status: 400 });
  }

  const periods = intervention.rolloutDesign.kind === "stepped_wedge" ? intervention.rolloutDesign.periods : 2;
  const { observations, excludedGroups } = await getProgramPeriodObservations(intervention.programId, periods);

  if (observations.length === 0) {
    return Response.json({ ok: false, error: "no observations available (all affected groups below k-anonymity threshold, or no events yet)" }, { status: 422 });
  }

  const subject = intervention.kind;
  const estimated = estimateInterventionEffect(
    intervention.rolloutDesign,
    observations,
    subject,
    intervention.designIdentification as DesignIdentification
  );
  const record = recordInterventionResult(intervention.id, intervention.expectedEffect.value, estimated.value);
  await saveInterventionResult(record, estimated.method);

  return Response.json({ ok: true, estimated, record, excludedGroups });
}
