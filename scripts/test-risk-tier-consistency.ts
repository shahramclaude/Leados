// LEADOS — Part 56: risk-tier mapping consistency test (Phase 4 gate 5).
// Confirms every registry entry's regulatoryTier is the canonical mapping of
// its Part-10-style actionTier, and that decisionRole/actionTier/human-review
// combinations obey LEADOS automation policy. Also proves the checker can
// catch a deliberately broken entry.
import { REGISTRY } from "../src/lib/accountability/registry";
import { checkTierConsistency, mapActionTierToRegulatoryTier } from "../src/lib/accountability/riskTiers";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

function main() {
  console.log("=== Test: risk-tier mapping consistency (real registry) ===");
  for (const def of REGISTRY) {
    const regulatoryTier = mapActionTierToRegulatoryTier(def.actionTier);
    const requiresHumanReview = def.decisionRole === "automate" && def.actionTier === "T4";
    const issues = checkTierConsistency({
      systemId: def.id,
      actionTier: def.actionTier,
      regulatoryTier,
      decisionRole: def.decisionRole,
      requiresHumanReview,
    });
    check(`${def.id}: actionTier ${def.actionTier} -> regulatoryTier "${regulatoryTier}" is consistent`, issues.length === 0);
  }

  console.log("\n=== Test: checker catches an inconsistent (broken) entry ===");
  const broken = checkTierConsistency({
    systemId: "broken-fixture",
    actionTier: "T1",
    regulatoryTier: "minimal", // wrong: T1 maps to "limited"
    decisionRole: "recommend",
    requiresHumanReview: false,
  });
  check("mismatched regulatoryTier is flagged", broken.some((i) => i.code === "tier-map-mismatch"));

  console.log("\n=== Test: checker blocks automation below the T3 floor ===");
  const belowFloor = checkTierConsistency({
    systemId: "broken-fixture-2",
    actionTier: "T1",
    regulatoryTier: "limited",
    decisionRole: "automate",
    requiresHumanReview: false,
  });
  check("automate at T1 is flagged as below the automation floor", belowFloor.some((i) => i.code === "automate-below-floor"));

  console.log("\n=== Test: checker requires human review for T4 automation ===");
  const missingReview = checkTierConsistency({
    systemId: "broken-fixture-3",
    actionTier: "T4",
    regulatoryTier: "high",
    decisionRole: "automate",
    requiresHumanReview: false,
  });
  check("T4 automate without requiresHumanReview is flagged", missingReview.some((i) => i.code === "t4-missing-human-review"));

  console.log(`\n=== Risk-tier consistency test: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
