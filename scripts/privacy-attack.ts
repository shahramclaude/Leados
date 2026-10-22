/**
 * Standalone privacy attempt-matrix runner (Phase 4 gate 1), usable outside
 * vitest (e.g. in CI as a readable report). Mirrors
 * `src/lib/change/__tests__/privacy.test.ts` but prints a human-readable
 * PASS/FAIL table instead of assertions, for the verification log.
 *
 * Run with: npx tsx scripts/privacy-attack.ts
 */
import { seedDatabase } from "../src/lib/change/repository";
import { containsBannedField, K_ANONYMITY_THRESHOLD } from "../src/lib/privacy/aggregation";
import { GET as readinessGET } from "../src/app/api/change/readiness/route";
import { GET as programDetailGET } from "../src/app/api/change/programs/[id]/route";
import { GET as saturationGET } from "../src/app/api/change/saturation/route";
import { SEED_GROUPS } from "../src/lib/change/seed";

const SMALL_GROUP_ID = "finance-ops";

type AttemptResult = { name: string; pass: boolean; detail: string };

async function main() {
  await seedDatabase(new Date("2026-02-01"));
  const results: AttemptResult[] = [];

  const readiness = await (await readinessGET()).json();
  const smallGroupView = readiness.groups.find((g: { groupId: string }) => g.groupId === SMALL_GROUP_ID);
  const smallGroupSeed = SEED_GROUPS.find((g) => g.id === SMALL_GROUP_ID)!;
  results.push({
    name: "1. Small-group readiness is suppressed, not a number",
    pass: smallGroupSeed.headcount < K_ANONYMITY_THRESHOLD && smallGroupView.readiness.ok === false,
    detail: `headcount=${smallGroupSeed.headcount}, threshold=${K_ANONYMITY_THRESHOLD}, readiness.ok=${smallGroupView.readiness.ok}`,
  });

  results.push({
    name: "2. Readiness payload has no banned individual-level field",
    pass: containsBannedField(readiness) === null,
    detail: `containsBannedField -> ${containsBannedField(readiness)}`,
  });

  const programDetail = await (
    await programDetailGET(new Request("http://local/api/change/programs/prog-expense"), {
      params: Promise.resolve({ id: "prog-expense" }),
    })
  ).json();
  const smallGroupFunnel = programDetail.funnel.byGroup.find((g: { groupId: string }) => g.groupId === SMALL_GROUP_ID);
  results.push({
    name: "3. Program detail suppresses the small group's funnel",
    pass: smallGroupFunnel.result.ok === false && containsBannedField(programDetail) === null,
    detail: `funnel.ok=${smallGroupFunnel.result.ok}`,
  });

  const notFoundRes = await programDetailGET(new Request("http://local/api/change/programs/does-not-exist"), {
    params: Promise.resolve({ id: "does-not-exist" }),
  });
  results.push({
    name: "4. Nonexistent program id returns 404, no fallback dump",
    pass: notFoundRes.status === 404,
    detail: `status=${notFoundRes.status}`,
  });

  const saturation = await (await saturationGET(new Request("http://local/api/change/saturation"))).json();
  const evidenceOk = saturation.findings.every((f: { evidence: { programs: Array<Record<string, unknown>> } }) =>
    f.evidence.programs.every((p) => Object.keys(p).sort().join(",") === "id,intent,loadWeight")
  );
  results.push({
    name: "5. Saturation evidence lists only program fields (id/intent/loadWeight)",
    pass: evidenceOk && containsBannedField(saturation) === null,
    detail: `evidenceOk=${evidenceOk}`,
  });

  results.push({
    name: "6. Readiness handler takes zero request parameters (structurally un-queryable)",
    pass: readinessGET.length === 0,
    detail: `arity=${readinessGET.length}`,
  });

  const junk = await (
    await saturationGET(new Request("http://local/api/change/saturation?personId=finance-ops-p0&employeeId=1&dump=true"))
  ).json();
  results.push({
    name: "7. Junk query params on saturation route have no effect beyond documented `threshold`",
    pass: JSON.stringify(junk.findings.map((f: { id: string }) => f.id)) === JSON.stringify(saturation.findings.map((f: { id: string }) => f.id)),
    detail: `findings unchanged under injected params`,
  });

  console.log("\nPrivacy attempt matrix\n=======================");
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}\n       ${r.detail}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
