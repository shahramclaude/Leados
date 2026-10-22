#!/usr/bin/env node
// scripts/verify.mjs — `npm run verify`
// Mirrors the mandatory final-validation sequence plus the Part 18 perf
// gates: typegen -> tsc -> build -> perf:check (bundle budgets) -> boot a
// throwaway server -> smoke-test the API routes -> teardown.
// `npm run loadtest` is intentionally NOT part of this fast gate (it takes
// ~15s+ and spawns its own server); run it separately — see
// docs/PERFORMANCE.md.
import { spawn, spawnSync } from "node:child_process";

const PORT = 3102;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`command failed: ${cmd} ${args.join(" ")}`);
  }
}

async function waitForHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  run("npx", ["next", "typegen"]);
  run("npm", ["exec", "tsc", "--", "--noEmit", "--pretty", "false"]);
  run("npm", ["run", "build"]);
  run("node", ["scripts/perf-check.mjs"]);

  console.log(`\nStarting throwaway server on port ${PORT} for HTTP smoke tests...`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit" });

  try {
    const up = await waitForHealth(SERVER_URL);
    if (!up) throw new Error("server did not become healthy in time");

    const checks = [
      ["/api/health", 200],
      ["/api/people?limit=10", 200],
      ["/api/network", 200],
      ["/api/heatmap", 200],
      ["/api/forecast?scenario=baseline", 200],
    ];
    for (const [path, expected] of checks) {
      const res = await fetch(`${SERVER_URL}${path}`);
      console.log(`  GET ${path} -> ${res.status}`);
      if (res.status !== expected) throw new Error(`${path} returned ${res.status}, expected ${expected}`);
    }
    console.log("\nAll smoke tests passed.");
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
