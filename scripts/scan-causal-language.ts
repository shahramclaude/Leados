// Part 05 rule enforcement: scans all UI copy (.tsx under src/app and
// src/components) for banned causal phrasing, and asserts the succession UI
// states the "decision support, not a decision" disclaimer.
import fs from "fs";
import path from "path";
import { scanForCausalClaims } from "../src/lib/causalLanguage";

const ROOTS = ["src/app", "src/components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) out.push(full);
  }
  return out;
}

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures++;
}

function main() {
  console.log("=== Causal-language UI scan (Part 05 rules) ===");
  const files = ROOTS.flatMap((r) => walk(r));
  let violationCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const violations = scanForCausalClaims(content);
    for (const v of violations) {
      violationCount++;
      console.log(`  VIOLATION: ${file} — "${v.phrase}" in: ...${v.context}...`);
    }
  }
  check(`No banned causal phrases found across ${files.length} UI source file(s)`, violationCount === 0, `${violationCount} violation(s)`);

  const talentFile = fs.readFileSync("src/components/TalentView.tsx", "utf8");
  check(
    "Succession UI states 'decision support, not a decision'",
    /decision support, not a decision/i.test(talentFile),
  );

  const retentionBadge = fs.readFileSync("src/components/RetentionRiskBadge.tsx", "utf8");
  check(
    "Flight-risk badge does not claim prediction of future behavior",
    !/will (leave|quit|resign)/i.test(retentionBadge),
  );

  console.log(`\n${failures === 0 ? "ALL CAUSAL-LANGUAGE CHECKS PASSED" : `${failures} CAUSAL-LANGUAGE CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
