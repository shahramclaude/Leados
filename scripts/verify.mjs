#!/usr/bin/env node
// LEADOS Part 14 — verification harness.
//
// NOTE: this repository's package.json cannot be edited directly per this
// project's standing instructions (only `install_npm_packages` may touch
// dependencies), so there is no `npm run verify` script wired up. This file
// is the equivalent suite — run it with `node scripts/verify.mjs`. It:
//   1. runs `npx next typegen`
//   2. runs `tsc --noEmit`
//   3. runs `npm run build`
//   4. boots a `next start` instance on a throwaway port
//   5. runs the unit test (no network) + DB-level test + HTTP-level tests
//   6. tears the throwaway server down
//
// Exits non-zero if any step fails.
import { spawn, spawnSync } from "node:child_process";

const PORT = 3100;
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

  console.log("\n$ unit test (no network, no DB): backpressure + scoping");
  run("npx", ["tsx", "scripts/tests/backpressure-and-scoping.test.ts"]);

  console.log("\n$ DB-level test: interrupt budget + dedupe burst");
  run("npx", ["tsx", "scripts/tests/budget-and-dedupe.test.ts"]);

  console.log(`\nStarting throwaway server on port ${PORT} for HTTP-level tests...`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit" });

  try {
    const up = await waitForHealth(SERVER_URL);
    if (!up) throw new Error("server did not become healthy in time");

    run("npx", ["tsx", "scripts/tests/http-realtime.test.ts"], { env: { ...process.env, SERVER_URL } });
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nAll verification steps passed.");
}

main().catch((err) => {
  console.error(`\nVerification failed: ${err.message}`);
  process.exit(1);
});
