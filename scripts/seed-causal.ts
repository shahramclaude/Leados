/**
 * Idempotently seeds the database with:
 *  - the LEADOS people SCM (`causal_models`)
 *  - two demo causal claims: the confounded flagship claim
 *    (1:1 frequency -> retention, non-identifiable) and the identifiable
 *    engagement -> retention claim, each with a falsification report.
 *
 * Run with: npx tsx scripts/seed-causal.ts
 */
import "dotenv/config";
import { DEMO_EVIDENCE, LEADOS_PEOPLE_SCM, generateDemoDataset } from "../src/lib/causal/domainModel";
import { runCausalQuery } from "../src/lib/causal/query";
import { buildFalsificationReport, negativeControlTest, placeboTest } from "../src/lib/causal/validation";
import { upsertModel, saveClaim } from "../src/lib/causal/store";
import { pool } from "../src/db";
import type { CausalClaim } from "../src/lib/causal/types";

async function main() {
  const data = generateDemoDataset();

  await upsertModel(LEADOS_PEOPLE_SCM);
  console.log(`Seeded SCM "${LEADOS_PEOPLE_SCM.id}".`);

  const queries: { id: string; label: string; effect: string; on: string }[] = [
    {
      id: "claim-1on1-retention",
      label: "1:1 frequency and retention (flagship claim)",
      effect: "oneOnOneFrequency",
      on: "retentionStays",
    },
    {
      id: "claim-engagement-retention",
      label: "Engagement score and retention",
      effect: "engagementScore",
      on: "retentionStays",
    },
  ];

  for (const q of queries) {
    const estimate = runCausalQuery({
      scm: LEADOS_PEOPLE_SCM,
      query: { effect: q.effect, on: q.on, population: "all active employees, trailing 12 months" },
      data,
      evidence: DEMO_EVIDENCE,
    });

    let falsification;
    if (estimate.identifiable) {
      const placebo = placeboTest(data, q.effect, q.on, estimate.adjustmentSet, estimate.estimate?.ate ?? 0, {
        method: "regression",
      });
      const negativeControl = negativeControlTest(data, q.effect, "commuteDistanceKm", estimate.adjustmentSet);
      falsification = buildFalsificationReport(q.id, placebo, negativeControl, true);
    }

    const claim: CausalClaim = {
      id: q.id,
      scmId: LEADOS_PEOPLE_SCM.id,
      label: q.label,
      estimate,
      falsification,
      asOf: estimate.asOf,
      revalidateBy: estimate.revalidateBy,
    };
    await saveClaim(claim);
    console.log(
      `Seeded claim "${q.id}": identifiable=${estimate.identifiable}${
        estimate.identifiable ? `, ate=${estimate.estimate?.ate.toFixed(3)}` : `, r=${estimate.associationOnly?.r.toFixed(3)}`
      }`
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
