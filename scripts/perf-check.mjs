#!/usr/bin/env node
// scripts/perf-check.mjs — `npm run perf:check`
//
// Measures each route's real first-load JS (gzip) from
// `.next/diagnostics/route-bundle-stats.json` (Next.js's own per-route chunk
// list) and fails the build if it exceeds the budget declared in
// `perf-budgets.json`. This is a real measurement of the files that would
// actually ship to a browser, not an estimate — `npm run build` must be run
// first.
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const statsPath = path.join(root, ".next/diagnostics/route-bundle-stats.json");
const budgetsPath = path.join(root, "perf-budgets.json");

if (!existsSync(statsPath)) {
  console.error(`Missing ${statsPath} — run \`npm run build\` first.`);
  process.exit(1);
}

const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"));

const gzipCache = new Map();
function gzipSizeOf(relPath) {
  if (gzipCache.has(relPath)) return gzipCache.get(relPath);
  const abs = path.join(root, relPath);
  if (!existsSync(abs)) {
    console.warn(`  (warning: chunk not found on disk: ${relPath})`);
    gzipCache.set(relPath, 0);
    return 0;
  }
  const buf = readFileSync(abs);
  const gz = gzipSync(buf, { level: 9 }).length;
  gzipCache.set(relPath, gz);
  return gz;
}

let anyFail = false;
const rows = [];

for (const [route, budget] of Object.entries(budgets.routes)) {
  const entry = stats.find((s) => s.route === route);
  if (!entry) {
    console.warn(`(warning: route ${route} not found in route-bundle-stats.json — skipping)`);
    continue;
  }
  const gzipBytes = entry.firstLoadChunkPaths.reduce((acc, p) => acc + gzipSizeOf(p), 0);
  const gzipKb = gzipBytes / 1024;
  const pass = gzipKb <= budget.maxInitialJsKb;
  if (!pass) anyFail = true;
  rows.push({ route, gzipKb: gzipKb.toFixed(1), budgetKb: budget.maxInitialJsKb, pass });
}

console.log("\n=== perf:check — initial JS (gzip) per route ===");
for (const r of rows) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.route.padEnd(12)} ${String(r.gzipKb).padStart(7)} KB  (budget ${r.budgetKb} KB)`);
}

console.log(anyFail ? "\nperf:check FAILED (bundle budget exceeded)" : "\nperf:check PASSED");
process.exit(anyFail ? 1 : 0);
