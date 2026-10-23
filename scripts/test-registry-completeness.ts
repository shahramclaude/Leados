// LEADOS — Part 56: tests the registry-completeness audit ITSELF.
// Phase 4 gate 1 requires: "the audit itself is tested against seeded
// unregistered modules". This script:
//   1. Confirms the real project registry currently passes (coverage 100%).
//   2. Plants a fixture module with a SYSTEM_ID that is NOT in the registry,
//      re-runs the audit, and asserts it is caught (FAIL + correct code).
//   3. Plants a fixture module matched by import-pattern only (verb-named
//      export, non-matching filename) with no SYSTEM_ID at all, and asserts
//      it is caught as "missing-system-id".
//   4. Removes the fixtures so the tree is left clean either way.
import fs from "node:fs";
import path from "node:path";
import { REGISTRY } from "../src/lib/accountability/registry";
import { auditRegistry } from "./lib/registryAudit";

const projectRoot = process.cwd();
const intelligenceDir = path.join(projectRoot, "src", "lib", "intelligence");
const fixtureDir = path.join(intelligenceDir, "__fixtures__");

let failures = 0;

function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

function withFixture(fileName: string, content: string, run: () => void) {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const filePath = path.join(fixtureDir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  try {
    run();
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

function main() {
  console.log("=== Test: registry completeness audit (real project) ===");
  const baseline = auditRegistry({ dirs: [intelligenceDir], registry: REGISTRY, projectRoot });
  check("real project registry currently has zero issues", baseline.ok);
  check("real project coverage is 100%", baseline.coveragePct === 100);

  console.log("\n=== Test: audit catches an unregistered scoring module (naming convention) ===");
  withFixture(
    "rogueScorer.ts",
    `export const SYSTEM_ID = "rogue-unregistered-scorer-v1";\nexport function scoreRogue(x: number) { return x; }\n`,
    () => {
      const report = auditRegistry({ dirs: [intelligenceDir, fixtureDir], registry: REGISTRY, projectRoot, skipStaleCheck: true });
      check("audit fails overall", !report.ok);
      check(
        "audit reports unregistered-module for rogueScorer.ts",
        report.issues.some((i) => i.code === "unregistered-module" && i.message.includes("rogueScorer.ts")),
      );
    },
  );

  console.log("\n=== Test: audit catches an import-pattern match with no SYSTEM_ID ===");
  withFixture(
    "hiddenEngine.ts",
    `export function predictSomethingSneaky(x: number) { return x * 2; }\n`,
    () => {
      const report = auditRegistry({ dirs: [intelligenceDir, fixtureDir], registry: REGISTRY, projectRoot, skipStaleCheck: true });
      check("audit fails overall", !report.ok);
      check(
        "audit reports missing-system-id for hiddenEngine.ts",
        report.issues.some((i) => i.code === "missing-system-id" && i.message.includes("hiddenEngine.ts")),
      );
    },
  );

  console.log("\n=== Test: audit catches a stale registry entry (module deleted) ===");
  {
    const fakeRegistry = [
      ...REGISTRY,
      {
        ...REGISTRY[0],
        id: "ghost-system-v1",
        sourceModule: "src/lib/intelligence/doesNotExist.ts",
      },
    ];
    const report = auditRegistry({ dirs: [intelligenceDir], registry: fakeRegistry, projectRoot });
    check("audit fails overall", !report.ok);
    check(
      "audit reports stale-registry-entry for ghost-system-v1",
      report.issues.some((i) => i.code === "stale-registry-entry" && i.message.includes("ghost-system-v1")),
    );
  }

  // Cleanup: remove fixture dir if empty
  if (fs.existsSync(fixtureDir) && fs.readdirSync(fixtureDir).length === 0) {
    fs.rmdirSync(fixtureDir);
  }

  console.log(`\n=== Registry audit self-test: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
