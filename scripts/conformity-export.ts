// LEADOS — Part 56: `npm run conformity:export` — produces the conformity
// evidence bundle (registry + assessments + monitoring + fairness + audit
// chain slices) for an explicitly-named scope/frame. See
// src/lib/accountability/conformity.ts for the honesty-by-construction rules.
import "./lib/loadEnv";
import fs from "node:fs";
import path from "node:path";
import { pool } from "../src/db";
import { buildConformityBundle, validateConformityBundle, SUPPORTED_FRAMES, type ConformityFrame } from "../src/lib/accountability/conformity";

function parseFrameArg(): ConformityFrame {
  const arg = process.argv.find((a) => a.startsWith("--frame="));
  const requested = arg ? arg.split("=")[1] : "internal-governance-baseline";
  if (!(SUPPORTED_FRAMES as readonly string[]).includes(requested)) {
    console.error(`Unknown --frame "${requested}". Supported frames: ${SUPPORTED_FRAMES.join(", ")}`);
    process.exit(1);
  }
  return requested as ConformityFrame;
}

async function main() {
  const frame = parseFrameArg();
  console.log("=== LEADOS Part 56 — Conformity Evidence Export ===");
  console.log(`Scope/frame requested: ${frame}`);

  const bundle = await buildConformityBundle(frame);
  const validation = validateConformityBundle(bundle);

  if (!validation.success) {
    console.error("RESULT: FAIL — bundle did not pass schema validation:");
    console.error(validation.error.issues);
    await pool.end();
    process.exit(1);
  }

  const exportsDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const fileName = `conformity-bundle-${frame}-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(exportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), "utf8");

  console.log(`Scope statement: ${bundle.scope.statement}`);
  console.log("Explicitly NOT certified by this bundle:");
  for (const item of bundle.scope.notCertified) console.log(`  - ${item}`);
  console.log(`Systems included: ${bundle.registry.length}`);
  console.log(`Impact assessments included: ${bundle.impactAssessments.length}`);
  console.log(`Monitoring checks included: ${bundle.monitoring.length}`);
  console.log(`Fairness reports included: ${bundle.fairness.length}`);
  console.log(`Audit chain slices included: ${bundle.auditChain.length}`);
  console.log(`Known gaps listed in bundle (not smoothed over): ${bundle.gaps.length}`);
  for (const gap of bundle.gaps) console.log(`  - ${gap}`);
  console.log(`RESULT: PASS — schema-valid bundle written to ${path.relative(process.cwd(), filePath)}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error("Conformity export failed:", err);
  await pool.end();
  process.exit(1);
});
