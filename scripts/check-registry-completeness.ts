// LEADOS — Part 56: CI gate — registry completeness.
// Fails the pipeline (non-zero exit) if any scoring/predicting/recommending/
// flagging module under src/lib/intelligence is missing a registry entry, or
// if the registry references a module that no longer exists / no longer
// matches. Run via `npm run registry:lint`.
import path from "node:path";
import { REGISTRY } from "../src/lib/accountability/registry";
import { auditRegistry } from "./lib/registryAudit";

const projectRoot = process.cwd();
const intelligenceDir = path.join(projectRoot, "src", "lib", "intelligence");

function main() {
  const report = auditRegistry({ dirs: [intelligenceDir], registry: REGISTRY, projectRoot });

  console.log("=== LEADOS Part 56 — Registry Completeness Audit ===");
  console.log(`Scanned: ${intelligenceDir}`);
  console.log(`Discovered algorithmic modules: ${report.discovered.length}`);
  for (const mod of report.discovered) {
    console.log(`  - ${path.relative(projectRoot, mod.filePath)} -> SYSTEM_ID=${mod.systemId ?? "(missing)"} [${mod.matchedBy.join(", ")}]`);
  }
  console.log(`Registry entries: ${REGISTRY.length}`);
  console.log(`Coverage: ${report.coveragePct}%`);

  if (report.issues.length === 0) {
    console.log("RESULT: PASS — every discovered module has a registry entry, and every registry entry resolves to a real module.");
    process.exit(0);
  }

  console.log(`RESULT: FAIL — ${report.issues.length} issue(s):`);
  for (const issue of report.issues) {
    console.log(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

main();
