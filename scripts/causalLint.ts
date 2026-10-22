/**
 * scripts/causalLint.ts
 * Phase 4, Gate (4): "causal:lint catches seeded violations."
 * Lints every live narrative produced by the demo claim bundle (must be
 * 100% clean, since they are produced by languagePolicy.generateNarrative),
 * AND runs the deliberately seeded violations to prove the linter actually
 * catches bad language rather than trivially passing everything.
 *
 * Run with: npx tsx scripts/causalLint.ts
 */
import { getLiveNarrativeFixtures, SEEDED_VIOLATIONS } from "../src/content/causalNarratives";
import { lintNarratives } from "../src/lib/causal/languagePolicy";
import { PHASE_0_FINDINGS } from "../src/content/legacyNarratives";
import { Harness } from "./testHarness";

const h = new Harness("causal:lint");

// 1. Live, generator-produced narratives must be 100% clean.
const live = getLiveNarrativeFixtures();
const liveViolations = lintNarratives(live);
h.check(
  `all ${live.length} live generated narratives are language-policy compliant`,
  liveViolations.length === 0,
  liveViolations.length > 0 ? JSON.stringify(liveViolations) : undefined,
);
for (const item of live) {
  console.log(`  - [${item.claimClass}] ${item.id}: "${item.text}"`);
}

// 2. Phase 0 legacy findings (documented as "FAIL" before this part existed)
//    must ALSO be caught if we lint them as the (wrong) "causal" labels the
//    legacy copy implicitly used — this proves the lint logic actually
//    recognizes the strong-causal phrases documented in the audit.
const legacyAsClaimedCausalButShouldBeAssociational = PHASE_0_FINDINGS.map((f, i) => ({
  id: `legacy-${i}`,
  text: f.phrase,
  claimClass: "associational" as const, // what the evidence class actually supports
}));
const legacyViolations = lintNarratives(legacyAsClaimedCausalButShouldBeAssociational);
h.check(
  `lint correctly flags ALL ${PHASE_0_FINDINGS.length} Phase-0 legacy phrases as violations when (honestly) checked against the associational class their evidence supports`,
  legacyViolations.length === PHASE_0_FINDINGS.length,
  `caught ${legacyViolations.length}/${PHASE_0_FINDINGS.length}`,
);

// 3. Deliberately seeded violations must be caught.
const seededResults = lintNarratives(SEEDED_VIOLATIONS);
h.check(
  `both seeded violations are caught`,
  seededResults.length === SEEDED_VIOLATIONS.length,
  `caught ${seededResults.length}/${SEEDED_VIOLATIONS.length}`,
);
seededResults.forEach((r) => {
  console.log(`  seeded violation caught: ${r.id} -> ${r.violations.map((v) => v.reason).join(" | ")}`);
});

// 4. Negative control: a compliant associational narrative should NOT be flagged.
const negativeControl = lintNarratives([{ id: "neg-control", text: "Rep activity moved together with win rate this quarter.", claimClass: "associational" }]);
h.check(`negative control (compliant associational text) is NOT flagged`, negativeControl.length === 0);

const ok = h.summarize();
if (!ok) process.exit(1);
