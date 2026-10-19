import { db } from "@/db";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { LATENT_NODES, defaultObservables, computePosteriors, computeCascadeRisk, detectBeliefDrift } from "@/lib/beliefFabric";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("belief", async (_req, requestId) => {
  await ensureBaselineData(db);

  const posteriors = computePosteriors(defaultObservables());
  const cascadeRisk = computeCascadeRisk(posteriors);

  // Synthetic 14-day drift series derived from the current cascade
  // risk so the dashboard always has a trend to show.
  const driftSeries = Array.from({ length: 14 }, (_, i) => ({
    day: i,
    value: Math.max(0, Math.min(1, cascadeRisk - 0.1 + i * 0.01)),
  }));
  const drift = detectBeliefDrift(driftSeries);

  return jsonOk(
    {
      nodes: LATENT_NODES,
      posteriors,
      cascadeRisk,
      drift,
    },
    requestId,
  );
});
