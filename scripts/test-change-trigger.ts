// LEADOS — Part 56: change-trigger workflow test (Phase 4 gate 2).
// Proves a model update forces a reassessment: it cannot silently ship
// without a new (unapproved) impact assessment version being created and the
// prior approved version being superseded.
import "./lib/loadEnv";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { impactAssessments } from "../src/db/schema";
import { seedDatabase } from "../src/lib/accountability/seed";
import { getAssessmentHistory, getLatestAssessment, onModelUpdated } from "../src/lib/accountability/assessments";
import { getChain } from "../src/lib/accountability/auditChain";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

async function main() {
  console.log("=== Test: impact-assessment change-trigger workflow ===");
  await seedDatabase();

  const systemKey = "eligibility-scoring-v1";

  const before = await getLatestAssessment(systemKey);
  check("baseline assessment exists after seed", before !== null);
  check("baseline assessment is v1 and approved", before?.version === 1 && before?.status === "approved");

  const draft = await onModelUpdated({
    systemKey,
    actorId: "eng-001",
    reason: "Recalibrated dispute-rate weighting after Q1 appeal review.",
    linkedExperimentIds: ["exp-2026-eligibility-recalibration-14"],
  });

  check("model update produced a new draft assessment", draft.status === "draft");
  check("new draft is version 2", draft.version === 2);
  check("new draft is triggered by model_update", draft.triggeredBy === "model_update");
  check(
    "new draft carries the linked experiment id forward",
    draft.linkedExperimentIds.includes("exp-2026-eligibility-recalibration-14"),
  );

  const history = await getAssessmentHistory(systemKey);
  const v1 = history.find((h) => h.version === 1);
  const v2 = history.find((h) => h.version === 2);
  check("version 1 is now superseded", v1?.status === "superseded");
  check("version 2 is the new draft", v2?.status === "draft");
  check("exactly two assessment versions exist", history.length === 2);

  const latest = await getLatestAssessment(systemKey);
  check("getLatestAssessment resolves to v2 (latest by version)", latest?.version === 2);

  const chain = await getChain(systemKey);
  check(
    "audit chain recorded the model_updated event",
    chain.some((e) => e.action === "model_updated"),
  );
  check(
    "audit chain recorded the forced assessment_draft_created event",
    chain.some((e) => e.action === "assessment_draft_created" && (e.payload as { version?: number }).version === 2),
  );

  // Negative control: a system that was NOT updated must still show exactly
  // one (approved) assessment version — i.e. the trigger is scoped, not global.
  const untouchedHistory = await getAssessmentHistory("support-ticket-priority-scorer-v1");
  check("an untouched system's assessment history is unaffected (still v1, approved)", untouchedHistory.length === 1 && untouchedHistory[0].status === "approved");

  // Sanity: directly querying the table confirms the DB state matches the
  // helper functions' view (no divergence between read paths).
  const rawRows = await db.select().from(impactAssessments).where(eq(impactAssessments.systemKey, systemKey));
  check("raw table query agrees: 2 rows for the updated system", rawRows.length === 2);

  console.log(`\n=== Change-trigger workflow test: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test crashed:", err);
  await pool.end();
  process.exit(1);
});
