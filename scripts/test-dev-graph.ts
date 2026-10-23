// Phase 3(a) property test: every growth-path recommendation must cite real
// (non-self-rating) evidence of the gap it addresses. A gap backed only by a
// self-rating must never produce a recommendation.
import "./_env";
import { db } from "@/db";
import { evidenceEvents, people } from "@/db/schema";
import { recommendGrowthPaths } from "@/lib/development";
import { eq } from "drizzle-orm";

export async function run(): Promise<boolean> {
  console.log("=== test:dev-graph — growth-path citation property test ===");
  const allPeople = await db.select().from(people);
  let ok = true;
  let totalRecommendations = 0;

  for (const person of allPeople) {
    const recs = await recommendGrowthPaths(person.id);
    totalRecommendations += recs.length;

    for (const rec of recs) {
      if (rec.citedEvidenceIds.length === 0) {
        console.error(`FAIL: recommendation for ${person.id}/${rec.result.competencyId} cites no evidence.`);
        ok = false;
        continue;
      }
      for (const evidenceId of rec.citedEvidenceIds) {
        const [row] = await db.select().from(evidenceEvents).where(eq(evidenceEvents.id, evidenceId));
        if (!row) {
          console.error(`FAIL: cited evidence id ${evidenceId} does not exist.`);
          ok = false;
          continue;
        }
        if (row.personId !== person.id || row.competencyId !== rec.result.competencyId) {
          console.error(`FAIL: cited evidence ${evidenceId} does not belong to this person/competency.`);
          ok = false;
        }
        if (row.eventType === "self_rating") {
          console.error(`FAIL: recommendation for ${person.id}/${rec.result.competencyId} cites a self_rating-only event.`);
          ok = false;
        }
      }
    }

    // Negative check: the seeded self-rating-only resilience gap must NEVER
    // produce a recommendation for this person.
    const resilienceRec = recs.find((r) => r.result.competencyId === "comp_resilience");
    if (resilienceRec) {
      console.error(`FAIL: a recommendation was produced for comp_resilience (self-rating-only evidence) for ${person.id}.`);
      ok = false;
    }
  }

  console.log(`Checked ${allPeople.length} people, ${totalRecommendations} recommendations generated.`);
  console.log(ok ? "PASS: all recommendations cite real, non-self-rating gap evidence." : "RESULT: FAIL");
  return ok;
}

if (require.main === module) {
  run()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
