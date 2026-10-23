import { boardEffectivenessSummary, assertIndividualScoringPolicyEnabled } from "@/lib/governance/metrics";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("scope") === "individual") {
      // Structural hard stop: this throws unless a documented board policy
      // record exists, regardless of the caller's tier.
      await assertIndividualScoringPolicyEnabled();
      assertAccess(actor.boardTier, "governance_metrics_individual", "read");
      return Response.json({ ok: false, error: "Individual scoring is policy-gated and not implemented by default." }, { status: 501 });
    }

    assertAccess(actor.boardTier, "governance_metrics_aggregate", "read");
    const summary = await boardEffectivenessSummary();
    return Response.json({ ok: true, summary });
  } catch (err) {
    return toErrorResponse(err);
  }
}
