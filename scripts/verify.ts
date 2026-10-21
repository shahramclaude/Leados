// Acceptance-gate verification harness. Run with `npm run verify`.
// Exits 0 only if every gate passes. Prints real numbers (not asserted blindly)
// so the VERIFICATION LOG can be copied directly from this output.
import "dotenv/config";
import { pool } from "../src/db";
import { reconcile, runwayDistribution, runwayTornado, varianceAnalysis, fundraisingReadiness, covenantHeadroom } from "../src/lib/financialOS";
import { buildCascade, getCascade } from "../src/lib/okr";
import { generateBoardPack } from "../src/lib/boardPack";
import { allProjectStatuses } from "../src/lib/executionEngine";
import { backtestProject } from "../src/lib/delivery";
import { calibrationSummary } from "../src/lib/calibration";
import { openDueRetrospectives, completeRetrospective, listDecisions } from "../src/lib/decisionEngine";
import { hasProvenance } from "../src/lib/explain";
import { db } from "../src/db";
import { okrObjectives, okrKeyResults, okrInitiatives } from "../src/db/schema";

const failures: string[] = [];
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures.push(label);
}

async function main() {
  console.log("\n=== Gate 1: Financial reconciliation ties to the cent ===");
  const recon = await reconcile();
  check("reconciliation passes within tolerance", recon.value.pass, `${recon.value.rows.length} month/category rows checked, tolerance $0.01`);
  console.log(`  sample rows: ${JSON.stringify(recon.value.rows.slice(0, 3))}`);
  check("reconciliation result carries provenance (Explain<T> contract)", hasProvenance(recon));

  console.log("\n=== Runway distribution + tornado (adversarial Q1) ===");
  const runway = await runwayDistribution(1500, 36, 23);
  console.log(`  runway p10/p50/p90 = ${runway.value.p10.toFixed(1)} / ${runway.value.p50.toFixed(1)} / ${runway.value.p90.toFixed(1)} months`);
  const tornado = await runwayTornado();
  console.log("  tornado (dominant assumption first):");
  for (const row of tornado.value) console.log(`    ${row.key.padEnd(34)} swing=${row.swingMonths.toFixed(1)}mo  owner=${row.owner}`);
  check("tornado produced a ranked driver list", tornado.value.length > 0);
  check("dominant runway driver is owned by a named human (not 'unassigned')", tornado.value[0]?.owner !== "unassigned", tornado.value[0]?.owner);

  console.log("\n=== Variance analysis / root cause (2026-01 vs 2025-12) ===");
  const variance = await varianceAnalysis("2026-01");
  if (variance) {
    console.log(`  revenue variance: total=${variance.revenueVariance.value.totalVariance.toFixed(2)} price=${variance.revenueVariance.value.priceVariance.toFixed(2)} volume=${variance.revenueVariance.value.volumeVariance.toFixed(2)}`);
    console.log(`  cost variance: total=${variance.costVariance.value.totalVariance.toFixed(2)} headcount=${variance.costVariance.value.volumeVariance.toFixed(2)} comp=${variance.costVariance.value.priceVariance.toFixed(2)}`);
    check("variance analysis produced a decomposition", true);
  } else {
    check("variance analysis produced a decomposition", false);
  }

  const readiness = await fundraisingReadiness();
  console.log(`\nFundraising readiness: ${readiness.value.status} (p50 runway ${readiness.value.p50RunwayMonths.toFixed(1)}mo vs comfort threshold ${readiness.value.comfortThresholdMonths}mo)`);
  const covenants = await covenantHeadroom();
  for (const c of covenants) console.log(`  covenant "${c.value.name}": ${c.value.metric}=${c.value.value.toFixed(2)} ${c.value.operator} ${c.value.threshold} -> ${c.value.breached ? "BREACHED" : "ok"} (headroom ${c.value.headroom.toFixed(2)})`);

  console.log("\n=== Gate 5: every financial figure traces to an assumption or event ===");
  check("reconcile() has provenance", hasProvenance(recon));
  check("runwayDistribution() has provenance", hasProvenance(runway));
  check("runwayTornado() has provenance", hasProvenance(tornado));
  check("fundraisingReadiness() has provenance", hasProvenance(readiness));
  for (const c of covenants) check(`covenantHeadroom() "${c.value.name}" has provenance`, hasProvenance(c));

  console.log("\n=== Gate 4: OKR roll-up recomputes purely from events ===");
  const objectives = await db.select().from(okrObjectives);
  const keyResults = await db.select().from(okrKeyResults);
  const initiatives = await db.select().from(okrInitiatives);
  const statuses = await allProjectStatuses();
  const derivedMap = new Map(statuses.map((s) => [s.project.id, s.derivedStatus]));
  const rowsIn = {
    objectives: objectives.map((o) => ({ id: o.id, title: o.title, owner: o.owner, period: o.period, weight: Number(o.weight) })),
    keyResults: keyResults.map((k) => ({ id: k.id, objectiveId: k.objectiveId, title: k.title, startValue: Number(k.startValue), targetValue: Number(k.targetValue), currentValue: Number(k.currentValue), direction: k.direction, weight: Number(k.weight), selfReportedStatus: k.selfReportedStatus as "green" | "yellow" | "red", lastCheckIn: k.lastCheckIn ? new Date(k.lastCheckIn) : null })),
    initiatives: initiatives.map((i) => ({ id: i.id, keyResultId: i.keyResultId, title: i.title, weight: Number(i.weight), projectId: i.projectId })),
  };
  const run1 = buildCascade(rowsIn.objectives, rowsIn.keyResults, rowsIn.initiatives, derivedMap);
  const run2 = buildCascade(rowsIn.objectives, rowsIn.keyResults, rowsIn.initiatives, derivedMap);
  check("buildCascade() is pure (two runs on identical events produce identical output)", JSON.stringify(run1) === JSON.stringify(run2));
  check("cascade health score computed", typeof run1.healthScore === "number", `score=${run1.healthScore}`);
  check("at least one uncovered objective detected in seed data", run1.uncoveredObjectives.length > 0, run1.uncoveredObjectives.map((o) => o.title).join(", "));
  check("at least one orphan initiative detected in seed data", run1.orphanInitiatives.length > 0, run1.orphanInitiatives.map((i) => i.title).join(", "));

  console.log("\n=== Adversarial Q2: self-reported vs. derived OKR status disagreement ===");
  const cascade = await getCascade();
  for (const d of cascade.value.statusDisagreements) {
    console.log(`  KR "${d.title}": self-reported=${d.selfReported} vs derived=${d.derived} (severity ${d.severity})`);
  }
  check("disagreement between self-reported and derived OKR status is surfaced", cascade.value.statusDisagreements.length > 0);

  console.log("\n=== Gate 3: delivery backtest report (real error numbers) ===");
  const backtests = await Promise.all(statuses.map(async (s) => ({ project: s.project.title, result: await backtestProject(s.project.id) })));
  for (const b of backtests) console.log(`  ${b.project}: ${JSON.stringify(b.result)}`);
  const calSummary = await calibrationSummary("delivery");
  console.log(`  delivery calibration ledger: n=${calSummary.count}, mean error=${calSummary.meanError.toFixed(2)}d, mean |error|=${calSummary.meanAbsoluteError.toFixed(2)}d`);
  check("at least one delivery backtest recorded with a real error number", calSummary.count > 0, `MAE=${calSummary.meanAbsoluteError.toFixed(2)}d`);

  console.log("\n=== Decision intelligence: automatic retrospective + downside gate ===");
  const opened = await openDueRetrospectives();
  console.log(`  retrospectives auto-opened for decisions past review date: [${opened.join(", ")}]`);
  check("at least one decision past its review date auto-opened a retrospective", opened.length > 0);
  if (opened.length > 0) {
    const retro = await completeRetrospective(opened[0], { whatHappened: "Vendor integration took 5 extra weeks due to a data-mapping edge case, but churn-adjusted ARR impact was smaller than feared.", actualPayoff: 180000 }, "De-risk vendor data-mapping assumptions with a technical spike before committing next time.");
    console.log(`  retrospective completed: ${JSON.stringify(retro?.calibrationErrorNotes)}`);
    check("retrospective completion recorded a calibration error note", !!retro?.calibrationErrorNotes);
  }
  const decisionCalSummary = await calibrationSummary("decision");
  console.log(`  decision calibration ledger: n=${decisionCalSummary.count}, mean |error|=$${decisionCalSummary.meanAbsoluteError.toFixed(2)}`);

  console.log("\n=== Gate 2: board pack determinism ===");
  const packA = await generateBoardPack("2026-Q1-verify");
  const packB = await generateBoardPack("2026-Q1-verify");
  check("two board packs generated from identical underlying data share a content hash", packA.contentHash === packB.contentHash, `${packA.contentHash.slice(0, 12)}... vs ${packB.contentHash.slice(0, 12)}...`);
  console.log(`  sample narrative: ${packA.payload.narrativeSummary}`);
  console.log(`  top risks: ${JSON.stringify(packA.payload.topRisks)}`);
  console.log(`  evidence appendix entries: ${packA.payload.evidenceAppendix.length}`);
  check("board pack evidence appendix is non-empty", packA.payload.evidenceAppendix.length > 0);

  console.log("\n=== Summary ===");
  const allDecisions = await listDecisions();
  console.log(`  decisions in workspace: ${allDecisions.length}`);
  console.log(`  projects tracked: ${statuses.length}`);
  console.log(`  board packs stored: id ${packA.id}, ${packB.id}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} CHECK(S) FAILED:\n - ${failures.join("\n - ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll acceptance-gate checks passed.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
