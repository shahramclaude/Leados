// ---------------------------------------------------------------------------
// scripts/verify.ts
//
// `npm run verify` — runs the Phase 4 measurement gates against the seeded
// database and pure calculation modules:
//   1. Reconciliation identities (activity <-> finance) green within tolerance
//   2. Factor versioning: factor update produces a diffed recalculation
//   3. Evidence-class lint: every ESG figure carries method/class
//      (seeded violation is caught, then confirmed absent from real data)
//   4. MACC curve math matches hand computation
//   5. Disclosure pack generates with a full, round-trip-verified lineage manifest
//   6. Target trajectory + variance decomposition identities
// ---------------------------------------------------------------------------
import { pool } from "../src/db";
import {
  loadFactors,
  loadActivities,
  loadFinanceLedger,
  loadSpendActivities,
  loadEnvironmentalMetrics,
  loadPeopleAggregates,
  loadGovernanceDecisions,
  loadTargets,
  loadAbatementInitiatives,
} from "../src/lib/esgData";
import { reconcileActivityToFinance } from "../src/lib/costModel";
import { getActiveFactor, diffFactorVersions } from "../src/lib/emissionFactors";
import {
  computeCarbonLedger,
  aggregateScopeTotals,
  projectSocialMetrics,
  computeGovernanceMetrics,
  buildDisclosurePack,
  disclosureFiguresToSurfaceFigures,
  computeTrajectory,
  computeTargetVariance,
  decomposeEmissionVariance,
  STANDARD_MAPPING,
} from "../src/lib/sustainability";
import { buildMacc } from "../src/lib/macc";
import { lintEvidence, SurfaceFigure, explain } from "../src/lib/evidence";
import { verifyLineageManifest } from "../src/lib/lineage";

let passCount = 0;
let failCount = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

async function main() {
  console.log("=== Part 36 Sustainability Intelligence — verification ===\n");

  const [factors, acts, ledger, spendActs, envMetrics, peopleAgg, govDecisions, targetRows, abatement] = await Promise.all([
    loadFactors(),
    loadActivities(),
    loadFinanceLedger(),
    loadSpendActivities(),
    loadEnvironmentalMetrics(),
    loadPeopleAggregates(),
    loadGovernanceDecisions(),
    loadTargets(),
    loadAbatementInitiatives(),
  ]);

  // -------------------------------------------------------------------------
  console.log("[Gate 1] Reconciliation identities (activity <-> finance)");
  const reconciliation = reconcileActivityToFinance(spendActs, ledger, 0.01);
  check("reconciliation rows computed for every spend-based category", reconciliation.length >= 2);
  for (const row of reconciliation) {
    check(
      `  ${row.period}/${row.category}: activity $${row.activityTotalUsd.toFixed(2)} vs finance $${row.financeTotalUsd.toFixed(2)} (Δ${(row.deltaPct * 100).toFixed(3)}%)`,
      row.pass,
      `tolerance ${row.tolerancePct * 100}%`,
    );
  }
  // Seeded-violation style negative check: force a mismatch and confirm it is caught (not silently passed)
  const brokenLedger = ledger.map((l) => (l.category === "purchased_goods_it_hardware" ? { ...l, amountUsd: l.amountUsd * 1.5 } : l));
  const brokenReconciliation = reconcileActivityToFinance(spendActs, brokenLedger, 0.01);
  const brokenRow = brokenReconciliation.find((r) => r.category === "purchased_goods_it_hardware");
  check("reconciliation correctly FAILS a seeded 50% mismatch (negative control)", !!brokenRow && !brokenRow.pass);

  // -------------------------------------------------------------------------
  console.log("\n[Gate 2] Factor versioning produces a diffed recalculation (no silent number changes)");
  const oldDiesel = factors.find((f) => f.id === "EF-DIESEL-UK-2024-v1")!;
  const newDiesel = factors.find((f) => f.id === "EF-DIESEL-UK-2025-v2")!;
  check("both diesel factor versions present", !!oldDiesel && !!newDiesel);
  const dieselActivity = acts.find((a) => a.id === "ACT-DIESEL-2025Q3")!;
  const diff = diffFactorVersions([{ id: dieselActivity.id, quantity: dieselActivity.quantity }], oldDiesel, newDiesel);
  check("diff is non-zero between factor versions (change is visible, not silent)", diff[0].deltaKg !== 0, `deltaKg=${diff[0].deltaKg}`);
  check(
    "diff recomputation is exact: new - old = quantity * (newFactor - oldFactor)",
    approxEqual(diff[0].deltaKg, dieselActivity.quantity * (newDiesel.factorValue - oldDiesel.factorValue)),
  );
  const resolvedActive = getActiveFactor(factors, "scope1", "mobile_combustion_diesel", "UK", "2025-08-01");
  check("getActiveFactor resolves to the newer version for a 2025 date", resolvedActive?.id === "EF-DIESEL-UK-2025-v2");

  // -------------------------------------------------------------------------
  console.log("\n[Gate 3] Evidence-class lint: every ESG figure carries method + evidence class");
  const { ledger: carbonLedger, unresolvedActivities } = computeCarbonLedger(acts, factors);
  check("all seeded activities resolve to a factor (no unresolved activities)", unresolvedActivities.length === 0);
  const scopeTotals = aggregateScopeTotals(carbonLedger, "2025-Q3");
  const socialViews = projectSocialMetrics(peopleAgg);
  const governanceMetrics = computeGovernanceMetrics(govDecisions, "2025-Q3");
  const pack = buildDisclosurePack(
    {
      period: "2025-Q3",
      standard: "GRI/SASB/CSRD-style (documented mapping, not certified)",
      scopeTotals,
      environmental: envMetrics,
      social: socialViews,
      governance: governanceMetrics,
    },
    new Date().toISOString(),
  );
  const realSurfaceFigures = disclosureFiguresToSurfaceFigures(pack.figures);
  const realViolations = lintEvidence(realSurfaceFigures);
  check("zero evidence-class violations across real disclosure figures", realViolations.length === 0, JSON.stringify(realViolations));

  // Seeded violation (constructed directly, never written to the DB) to prove the lint actually catches problems
  const seededBadFigure: SurfaceFigure = {
    key: "seeded-violation",
    label: "Intentionally broken figure for lint self-test",
    unit: "tCO2e",
    explain: { value: 100, method: "measured", evidenceClass: undefined as never, uncertaintyPct: 0.01, sources: ["x"], asOf: "2025-Q3" },
  };
  const seededViolations = lintEvidence([seededBadFigure]);
  check("lint CATCHES a seeded missing-evidence-class figure (negative control)", seededViolations.length === 1 && seededViolations[0].reason === "missing evidenceClass");

  const seededFalsePrecision: SurfaceFigure = {
    key: "seeded-false-precision",
    label: "Spend-based estimate claiming near-zero uncertainty",
    unit: "tCO2e",
    explain: explain(500, "spend-based", "spend-based-estimate", ["x"], "2025-Q3", { uncertaintyPct: 0.01 }),
  };
  const falsePrecisionViolations = lintEvidence([seededFalsePrecision]);
  check(
    "lint CATCHES a seeded spend-based figure with implausibly low uncertainty (false-precision control)",
    falsePrecisionViolations.length === 1,
  );

  console.log("\n  Social metrics k-anonymity treatment:");
  for (const s of socialViews) {
    console.log(`    ${s.metric} / ${s.cohort}: ${s.suppressed ? "SUPPRESSED — " + s.reason : "shown, evidenceClass=" + s.explain!.evidenceClass}`);
  }
  const execPayEquity = socialViews.find((s) => s.cohort === "executive-leadership" && s.metric === "pay_equity_ratio");
  check("small cohort (n=4) pay-equity figure is suppressed, not shown (k-anonymity enforced)", !!execPayEquity?.suppressed);

  // -------------------------------------------------------------------------
  console.log("\n[Gate 4] MACC curve math matches hand computation");
  const macc = buildMacc(abatement);
  // Hand computation for the seeded five initiatives:
  // LED retrofit: -12000/38.5 = -311.6883...
  // PPA expansion: -4000/165 = -24.2424...
  // Travel policy: -9000/54 = -166.6667...
  // Supplier engagement: 40000/95 = 421.0526...
  // Fleet EV: 95000/210 = 452.3810...
  // Ascending order by cost/tonne: LED (-311.69), Travel (-166.67), PPA (-24.24), Supplier (421.05), FleetEV (452.38)
  const byId = new Map(macc.bars.map((b) => [b.id, b]));
  check("LED retrofit cost/tonne matches hand calc", approxEqual(byId.get("ABT-LED-RETROFIT")!.costPerTonneUsd, -12000 / 38.5, 1e-6));
  check("Fleet EV cost/tonne matches hand calc", approxEqual(byId.get("ABT-FLEET-EV")!.costPerTonneUsd, 95000 / 210, 1e-6));
  const order = macc.bars.map((b) => b.id);
  check(
    "bars are sorted ascending by cost per tonne (cheapest/most-negative first)",
    order[0] === "ABT-LED-RETROFIT" && order[order.length - 1] === "ABT-FLEET-EV",
  );
  const handTotalAbatement = 38.5 + 210 + 165 + 95 + 54;
  check("total abatement sums exactly to the hand-computed total", approxEqual(macc.totalAbatementTco2e, handTotalAbatement));
  const handTotalCost = -12000 + 95000 + -4000 + 40000 + -9000;
  check("total net cost sums exactly to the hand-computed total", approxEqual(macc.totalNetCostUsd, handTotalCost));
  check(
    "cumulative abatement at the last bar equals the total abatement",
    approxEqual(macc.bars[macc.bars.length - 1].cumulativeAbatementTco2e, macc.totalAbatementTco2e),
  );
  const handNetNegative = 38.5 + 165 + 54;
  check("net-negative-cost abatement matches hand calc", approxEqual(macc.netNegativeAbatementTco2e, handNetNegative));

  // -------------------------------------------------------------------------
  console.log("\n[Gate 5] Disclosure pack generates with a full, round-trip-verified lineage manifest");
  check("pack has figures for every standard-mapping metric key", pack.figures.length === STANDARD_MAPPING.length);
  check("pack explicitly lists gaps rather than fabricating missing figures", Array.isArray(pack.gaps));
  const knownRawIds = new Set<string>([
    ...carbonLedger.flatMap((r) => [r.activity.id, r.factor.id]),
    ...envMetrics.map((e) => e.id),
    ...peopleAgg.map((p) => p.id),
    ...govDecisions.map((g) => g.id),
  ]);
  const lineageCheck = verifyLineageManifest(pack.lineageManifest, knownRawIds);
  check("lineage manifest hash matches recomputed hash (round-trip)", lineageCheck.hashMatches);
  check("every lineage ref resolves to a known raw/activity/factor id (no dangling refs)", lineageCheck.ok, JSON.stringify(lineageCheck.missingRefs));
  // Tamper test: mutate a ref and confirm verification fails (round trip actually checks something)
  const tampered = { ...pack.lineageManifest, nodes: pack.lineageManifest.nodes.map((n, i) => (i === 0 ? { ...n, refs: [...n.refs, "NON-EXISTENT-ID"] } : n)) };
  const tamperedCheck = verifyLineageManifest(tampered, knownRawIds);
  check("tampered manifest (dangling ref injected) correctly FAILS verification", !tamperedCheck.ok);

  // -------------------------------------------------------------------------
  console.log("\n[Gate 6] Target trajectory + variance decomposition identities");
  const linearTarget = targetRows.find((t) => t.pathway === "linear")!;
  const trajectory = computeTrajectory(linearTarget);
  check("linear trajectory starts at baseline value", approxEqual(trajectory[0].expectedTco2e, linearTarget.baselineValueTco2e));
  check(
    "linear trajectory ends exactly at target value",
    approxEqual(trajectory[trajectory.length - 1].expectedTco2e, linearTarget.targetValueTco2e),
  );
  const geoTarget = targetRows.find((t) => t.pathway === "geometric")!;
  const geoTrajectory = computeTrajectory(geoTarget);
  check("geometric trajectory ends exactly at target value", approxEqual(geoTrajectory[geoTrajectory.length - 1].expectedTco2e, geoTarget.targetValueTco2e, 1e-3));

  const variance = computeTargetVariance(linearTarget, [{ year: linearTarget.baselineYear + 2, actualTco2e: linearTarget.baselineValueTco2e - 300 }]);
  check("variance computed for a requested year", variance.length === 1);

  const decomposition = decomposeEmissionVariance({ qty: 18000, rate: 2.6 }, { qty: 18500, rate: 2.7 });
  check(
    "two-factor decomposition identity holds exactly: volumeEffect + rateEffect = total (residual ~ 0)",
    approxEqual(decomposition.residual, 0, 1e-9),
    `residual=${decomposition.residual}`,
  );

  // -------------------------------------------------------------------------
  console.log("\n[Scope 2 dual reporting]");
  check("scope2 location-based total differs from market-based total (dual reporting is real, not a pass-through)", scopeTotals.scope2Location.value !== scopeTotals.scope2Market.value);
  check("scope2 location-based total is populated", scopeTotals.scope2Location.value > 0);
  check("scope2 market-based total is non-negative", scopeTotals.scope2Market.value >= 0);

  console.log(`\n  Carbon ledger quality mix for Scope 3 total: ${JSON.stringify(scopeTotals.scope3.qualityMix)}`);
  check("scope3 total exposes a qualityMix blending activity-based and spend-based shares", !!scopeTotals.scope3.qualityMix && Object.keys(scopeTotals.scope3.qualityMix).length >= 2);

  // -------------------------------------------------------------------------
  console.log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`);
  if (failCount > 0) {
    process.exitCode = 1;
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
