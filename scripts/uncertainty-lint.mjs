// scripts/uncertainty-lint.mjs
//
// Enforces: any leader-state UI source file that renders a derived,
// uncertain insight (fatigue proxy, decision-window suggestion, capacity
// score) must also render <UncertaintyNote>. This is a blunt, conservative
// static check — it can false-positive on files that merely mention these
// words in a comment, which is an acceptable tradeoff for a hard gate on a
// wellness-adjacent surface. Run standalone via `node scripts/uncertainty-lint.mjs`
// or imported by tests/uncertaintyLint.test.ts.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const INSIGHT_MARKERS = [
  "fatigueProxy",
  "decisionWindow",
  "capacityScore",
  "suggestedDecisionWindows",
  "lowestQualityBucket",
];

const SCAN_DIRS = ["src/app/my-state", "src/components/leaderState"];
const EXEMPT_BASENAMES = new Set(["UncertaintyNote.tsx"]);

export function listSourceFiles(rootDir, dirs) {
  const files = [];
  for (const dir of dirs) {
    const abs = path.join(rootDir, dir);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(rootDir, [path.join(dir, entry.name)]));
      } else if (/\.(tsx|ts)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

export function checkUncertaintyDisclosure(rootDir = process.cwd()) {
  const violations = [];
  const files = listSourceFiles(rootDir, SCAN_DIRS);

  for (const file of files) {
    const basename = path.basename(file);
    if (EXEMPT_BASENAMES.has(basename)) continue;
    const source = readFileSync(file, "utf8");
    const hasInsight = INSIGHT_MARKERS.some((marker) => source.includes(marker));
    if (!hasInsight) continue;
    const hasUncertaintyNote = source.includes("UncertaintyNote");
    if (!hasUncertaintyNote) {
      violations.push(
        `${path.relative(rootDir, file)} renders an insight marker (${INSIGHT_MARKERS.filter((m) => source.includes(m)).join(", ")}) without <UncertaintyNote>`,
      );
    }
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkUncertaintyDisclosure(process.cwd());
  if (violations.length > 0) {
    console.error("uncertainty-lint FAILED:");
    for (const v of violations) console.error(" - " + v);
    process.exit(1);
  } else {
    console.log("uncertainty-lint passed: every insight-rendering leader-state surface shows an UncertaintyNote.");
  }
}
