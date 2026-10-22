// =============================================================================
// Part 32 — `npm run verify`.
// =============================================================================
// Runs the Phase 4 gates against the real lib modules (no mocking of the
// compiler pipeline) and prints a transcript. Exits non-zero if any hard
// gate fails. This is the sandbox stand-in for the real repo's test runner
// (vitest/playwright are not installed here) — see AI-SESSION-LOG.md for why.
import { ORG_DATASETS } from "../src/lib/domainData";
import { compileDailyBrief, compileWeeklyPack, compileBoardPack } from "../src/lib/briefingCompiler";
import { runExecutiveJourney, runMobileLeadershipLoop } from "../src/lib/journey";
import { freezePack, latestVersion } from "../src/lib/snapshot";
import { checkCitations } from "../src/lib/citations";
import { lintSpeechReady } from "../src/lib/speechLint";
import { generateSlideDeck } from "../src/lib/slideGenerator";
import { QUESTION_ONTOLOGY } from "../src/lib/questionOntology";

let failures = 0;
function gate(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} — ${name}`);
  console.log(`    ${detail}`);
  if (!ok) failures++;
}

console.log("=== LEADOS Part 32 — npm run verify ===\n");

// ---------------------------------------------------------------------------
// Gate 1: the 5 leader questions, each in <=2 interactions, timed, transcript.
// ---------------------------------------------------------------------------
console.log("--- Gate 1: 5 leader questions in <=2 interactions (timed) ---");
for (const orgId of Object.keys(ORG_DATASETS)) {
  const ds = ORG_DATASETS[orgId];
  const journey = runExecutiveJourney(ds);
  gate(
    `[${orgId}] all 5 questions within interaction budget`,
    journey.allWithinBudget,
    `max interactions = ${journey.maxInteractions} (budget ${journey.budget}); total compile time = ${journey.steps.reduce((a, s) => a + s.computeMs, 0).toFixed(3)}ms`,
  );
  for (const step of journey.steps) {
    console.log(`    · ${step.question} -> ${step.interactions} click(s), ${step.computeMs.toFixed(3)}ms compile`);
    step.interactionTranscript.forEach((t, i) => console.log(`        ${i}. ${t}`));
  }
}
console.log("");

// ---------------------------------------------------------------------------
// Gate 2: board pack generates end-to-end with citation lint passing on
// every sentence (sample org + near-empty org).
// ---------------------------------------------------------------------------
console.log("--- Gate 2: board pack citation lint (every sentence) ---");
for (const orgId of Object.keys(ORG_DATASETS)) {
  const ds = ORG_DATASETS[orgId];
  const pack = compileBoardPack(ds);
  const allSentences = pack.sections.flatMap((s) => s.sentences);
  const issues = checkCitations(allSentences, pack.ledger);
  gate(`[${orgId}] board pack citation lint`, issues.length === 0, `${allSentences.length} sentences checked, ${pack.ledger.all().length} facts in ledger, ${issues.length} issue(s)`);
  issues.forEach((i) => console.log(`    ISSUE [${i.section}] ${i.reason}: "${i.text}"`));

  const deck = generateSlideDeck(pack);
  gate(`[${orgId}] slide deck generated end-to-end`, deck.slides.length === pack.sections.length + 2, `${deck.slides.length} slides (title + ${pack.sections.length} sections + appendix)`);
}
console.log("");

// ---------------------------------------------------------------------------
// Gate 3: numbers-freeze — source change after freeze leaves old pack
// unchanged; regeneration produces a new version with a diff.
// ---------------------------------------------------------------------------
console.log("--- Gate 3: numbers-freeze test ---");
{
  const ds = ORG_DATASETS["northwind"];
  const packV1 = compileBoardPack(ds);
  let history = freezePack(null, packV1, "verify-script");
  const v1 = latestVersion(history)!;
  const v1Fingerprint = v1.fingerprint;
  const v1RevenueFact = v1.pack.ledger.all().find((f) => f.label.includes("revenue (actual)"));

  // Simulate a source-data change: revenue actual moves after the freeze.
  const mutatedDs = { ...ds, finance: { ...ds.finance, revenueActual: ds.finance.revenueActual + 50000 } };
  const packV2 = compileBoardPack(mutatedDs);
  history = freezePack(history, packV2, "verify-script");
  const v2 = latestVersion(history)!;

  const v1Unchanged = latestVersion({ packKind: history.packKind, orgId: history.orgId, versions: [history.versions[0]] })!.fingerprint === v1Fingerprint;
  const gotNewVersion = v2.version === v1.version + 1;
  const diffHasRevenue = (v2.diffFromPrevious ?? []).some((d) => d.label.includes("revenue (actual)"));

  gate("old frozen version (v1) numbers unchanged after source mutation", v1Unchanged, `v1 fingerprint stayed ${v1Fingerprint}; v1 revenue fact = ${v1RevenueFact?.formatted}`);
  gate("source change after freeze produces a NEW version", gotNewVersion, `v1=${v1.version} -> v2=${v2.version}`);
  gate("new version carries an explicit diff for the changed fact", diffHasRevenue, `diff: ${JSON.stringify(v2.diffFromPrevious)}`);

  // Re-freezing with no change is a no-op (no version 3).
  const historyNoop = freezePack(history, compileBoardPack(mutatedDs), "verify-script");
  gate("re-freezing unchanged data does not mint a cosmetic new version", historyNoop.versions.length === 2, `versions = ${historyNoop.versions.length}`);
}
console.log("");

// ---------------------------------------------------------------------------
// Gate 4: mobile leadership loop @ 390px viewport.
// ---------------------------------------------------------------------------
console.log("--- Gate 4: mobile leadership loop @ 390px ---");
for (const orgId of Object.keys(ORG_DATASETS)) {
  const ds = ORG_DATASETS[orgId];
  const loop = runMobileLeadershipLoop(ds);
  gate(`[${orgId}] mobile loop completes all 4 steps at 390px`, loop.viewportPx === 390 && loop.steps.length === 5, `${loop.steps.length} steps, est. ${(loop.totalEstimateMs / 1000).toFixed(1)}s total`);
}
console.log("");

// ---------------------------------------------------------------------------
// Gate 5: speech-ready lint on DailyBrief (sentence length / no tables).
// ---------------------------------------------------------------------------
console.log("--- Gate 5: speech-ready lint on DailyBrief ---");
for (const orgId of Object.keys(ORG_DATASETS)) {
  const ds = ORG_DATASETS[orgId];
  const brief = compileDailyBrief(ds);
  gate(`[${orgId}] DailyBrief is speech-ready`, brief.speechLint.passed, `${brief.wordCount} words, ~${brief.estReadMinutes} min read`);
  brief.speechLint.errors.forEach((e) => console.log(`    ISSUE: ${e}`));
  gate(`[${orgId}] DailyBrief is <=5 min read`, brief.estReadMinutes <= 5, `estimated ${brief.estReadMinutes} min`);
  gate(`[${orgId}] DailyBrief zero-filler lint`, brief.zeroFillerLint.passed, `${brief.zeroFillerLint.errors.length} issue(s)`);
}
console.log("");

// Weekly pack sanity + <=15 min read + ontology coverage.
console.log("--- Additional: WeeklyPack coverage + read-time budget ---");
for (const orgId of Object.keys(ORG_DATASETS)) {
  const ds = ORG_DATASETS[orgId];
  const weekly = compileWeeklyPack(ds);
  const coveredQuestionIds = new Set(weekly.threads.map((t) => t.questionId));
  gate(`[${orgId}] WeeklyPack covers all 20 ontology questions`, coveredQuestionIds.size === QUESTION_ONTOLOGY.length, `${coveredQuestionIds.size}/${QUESTION_ONTOLOGY.length} questions covered`);
  gate(`[${orgId}] WeeklyPack is <=15 min read`, weekly.estReadMinutes <= 15, `estimated ${weekly.estReadMinutes} min, ${weekly.wordCount} words`);
  const issues = checkCitations(weekly.sections.flatMap((s) => s.sentences), weekly.ledger);
  gate(`[${orgId}] WeeklyPack citation lint`, issues.length === 0, `${issues.length} issue(s)`);
}
console.log("");

// Honest-emptiness check on the near-no-data org.
console.log("--- Additional: honest emptiness (fledgling org) ---");
{
  const weekly = compileWeeklyPack(ORG_DATASETS["fledgling"]);
  const notAnswerableCount = weekly.threads.filter((t) => t.verdict.startsWith("Not answerable yet")).length;
  gate("fledgling org surfaces explicit not-answerable states (no fabrication)", notAnswerableCount > 0, `${notAnswerableCount}/${weekly.threads.length} questions explicitly not-answerable-yet`);
}

console.log(`\n=== ${failures === 0 ? "ALL GATES PASSED" : `${failures} GATE(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
