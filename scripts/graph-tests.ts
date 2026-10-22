// =============================================================================
// scripts/graph-tests.ts — graph query correctness tests with EXPLAIN plans
// =============================================================================
// Exercises: neighbor expansion, shortest influence path, blast radius,
// cycle detection, orphan detection — against the seeded corpus (run
// scripts/seed.ts first) plus a small synthetic cycle fixture it creates
// and tears down itself.
//
// Run with: npx tsx scripts/graph-tests.ts
// =============================================================================

import "dotenv/config";
import { db } from "../src/db";
import { entities, relations } from "../src/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import {
  createEntity,
  createRelation,
  shortestInfluencePath,
  blastRadius,
  detectCycles,
  findOrphans,
  neighborExpansion,
} from "../src/lib/knowledgeGraph";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function explain(label: string, query: ReturnType<typeof sql>) {
  const result = await db.execute(sql`explain ${query}`);
  console.log(`\n--- EXPLAIN: ${label} ---`);
  for (const row of result.rows as Array<Record<string, unknown>>) {
    console.log(" ", Object.values(row)[0]);
  }
}

async function main() {
  console.log("=== Graph query tests ===\n");

  // ---- Fixture: find a known chain from the seeded corpus ----
  const [riskEntity] = await db
    .select()
    .from(entities)
    .where(eq(entities.name, "Payment gateway timeout cascades"));
  const [decisionEntity] = await db
    .select()
    .from(entities)
    .where(eq(entities.name, "Adopt circuit breakers for payment gateway calls"));
  const [metricEntity] = await db
    .select()
    .from(entities)
    .where(eq(entities.name, "Checkout error rate"));

  check("seed fixture present (risk/decision/metric entities found)", !!riskEntity && !!decisionEntity && !!metricEntity);

  if (riskEntity && decisionEntity && metricEntity) {
    // 1. Shortest influence path: risk -caused-> decision -informs-> metric
    const path = await shortestInfluencePath(riskEntity.id, metricEntity.id);
    check("shortest path risk -> metric found", !!path, JSON.stringify(path));
    check("shortest path depth is 2 (risk->decision->metric)", path?.depth === 2, `got depth=${path?.depth}`);
    check(
      "shortest path relation sequence is [caused, informs]",
      JSON.stringify(path?.relationPath) === JSON.stringify(["caused", "informs"]),
      JSON.stringify(path?.relationPath),
    );

    // 2. Blast radius from the risk entity should include the decision and metric
    const blast = await blastRadius(riskEntity.id, 3);
    const blastIds = blast.nodes.map((n) => n.node_id);
    check("blast radius includes decision entity", blastIds.includes(decisionEntity.id));
    check("blast radius includes metric entity", blastIds.includes(metricEntity.id));
    check("blast radius count matches node list length", blast.count === blast.nodes.length);

    // 3. Typed neighbor expansion depth 1 from risk should return only the decision
    const neighbors1 = await neighborExpansion(riskEntity.id, 1, "out");
    check(
      "depth-1 neighbor expansion from risk returns exactly the decision",
      neighbors1.length === 1 && neighbors1[0].node_id === decisionEntity.id,
      JSON.stringify(neighbors1.map((n) => n.name)),
    );
  }

  // ---- Cycle detection: build a synthetic 3-cycle, confirm detection, clean up ----
  const a = await createEntity({ type: "project", name: "__test_cycle_a__" });
  const b = await createEntity({ type: "project", name: "__test_cycle_b__" });
  const c = await createEntity({ type: "project", name: "__test_cycle_c__" });

  await createRelation({ fromEntityId: a.id, toEntityId: b.id, relationType: "depends_on", provenanceSource: "test", extractedBy: "human", confidenceClass: "confirmed" });
  await createRelation({ fromEntityId: b.id, toEntityId: c.id, relationType: "depends_on", provenanceSource: "test", extractedBy: "human", confidenceClass: "confirmed" });
  await createRelation({ fromEntityId: c.id, toEntityId: a.id, relationType: "depends_on", provenanceSource: "test", extractedBy: "human", confidenceClass: "confirmed" });

  const cycles = await detectCycles(6);
  const foundTestCycle = cycles.some((cyc) => [a.id, b.id, c.id].every((id) => cyc.path.includes(id)));
  check("cycle detection finds the synthetic 3-cycle", foundTestCycle, `found ${cycles.length} cycle(s) total`);

  // ---- Orphans: a freshly created, unconnected entity should appear ----
  const orphanCandidate = await createEntity({ type: "project", name: "__test_orphan__" });
  const orphans = await findOrphans();
  check(
    "orphan detection finds a freshly created unconnected entity",
    orphans.some((o) => o.id === orphanCandidate.id),
  );
  check(
    "orphan detection does NOT flag the connected cycle entities",
    !orphans.some((o) => [a.id, b.id, c.id].includes(o.id)),
  );

  // ---- EXPLAIN plans: recursive CTE neighbor expansion + relation lookups ----
  if (decisionEntity) {
    await explain(
      "relations lookup by from_entity_id (uses idx_relations_from)",
      sql`select * from relations where from_entity_id = ${decisionEntity.id}`,
    );
    await explain(
      "current-edges partial index scan (valid_to is null)",
      sql`select * from relations where valid_to is null and from_entity_id = ${decisionEntity.id}`,
    );
  }

  // ---- Cleanup synthetic fixtures ----
  const cleanupIds = [a.id, b.id, c.id, orphanCandidate.id];
  await db.delete(relations).where(inArray(relations.fromEntityId, cleanupIds));
  await db.delete(entities).where(inArray(entities.id, cleanupIds));

  console.log(`\n=== ${failures === 0 ? "ALL GRAPH TESTS PASSED" : failures + " GRAPH TEST(S) FAILED"} ===`);
  if (failures > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
