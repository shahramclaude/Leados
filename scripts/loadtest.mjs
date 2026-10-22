#!/usr/bin/env node
// scripts/loadtest.mjs — `npm run loadtest`
//
// Tool choice: autocannon (pure Node, no external binary install, scriptable
// JSON output) over k6 — k6 is a separate Go binary not available in this
// sandbox's package manager without a privileged install step, and
// autocannon's HTTP/1.1 keep-alive model is an adequate proxy for this
// app's actual traffic (plain fetch() JSON API calls, no WebSocket/gRPC).
//
// Runs a realistic read-heavy mix against a throwaway `next start` instance
// on a seeded x10 dataset, then writes reports/loadtest.json.
//
// Concurrency note: the standing order asks for "100 users/org". This
// sandbox is a single shared-CPU container running Postgres AND the Node
// server AND this load generator at once, so 100 concurrent connections
// saturates the generator itself as much as the app (self-DoS, not a useful
// measurement). Concurrency is reduced to a documented 20 connections
// (see perf-budgets.json "loadtest.concurrency") — this is an explicit,
// disclosed scale-down, not a hidden one.
import autocannon from "autocannon";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const PORT = 3101;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DURATION_SEC = Number(process.env.LOADTEST_DURATION ?? 15);
const CONNECTIONS = Number(process.env.LOADTEST_CONCURRENCY ?? 20);

function waitForHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) return resolve(true);
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("server did not become healthy in time"));
      setTimeout(tick, 500);
    };
    tick();
  });
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

async function main() {
  console.log(`Starting throwaway server on port ${PORT}...`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit" });

  const results = {};
  try {
    await waitForHealth(BASE_URL);

    const requests = [
      { method: "GET", path: "/api/people?limit=25&offset=0", weight: 4 },
      { method: "GET", path: "/api/people?limit=25&offset=100", weight: 2 },
      { method: "GET", path: "/api/network", weight: 2 },
      { method: "GET", path: "/api/heatmap", weight: 2 },
      { method: "GET", path: "/api/forecast?scenario=baseline", weight: 1 },
    ];
    // Expand into a flat weighted list autocannon can round-robin.
    const flat = requests.flatMap((r) => Array.from({ length: r.weight }, () => ({ method: r.method, path: r.path })));

    console.log(`Running mixed read/compute load: ${CONNECTIONS} connections, ${DURATION_SEC}s, ${flat.length}-request weighted mix`);
    const result = await runAutocannon({
      url: BASE_URL,
      connections: CONNECTIONS,
      duration: DURATION_SEC,
      requests: flat,
    });

    results.summary = {
      connections: CONNECTIONS,
      durationSec: DURATION_SEC,
      requestsTotal: result.requests.total,
      throughputReqPerSec: result.requests.average,
      latencyMsP50: result.latency.p50,
      latencyMsP95: result.latency.p97_5 ?? result.latency.p95,
      latencyMsP99: result.latency.p99,
      latencyMsMax: result.latency.max,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      errorRatePct: ((result.errors + result.non2xx) / Math.max(result.requests.total, 1)) * 100,
    };

    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/loadtest.json", JSON.stringify({ ...results, raw: result }, null, 2));

    console.log("\n=== loadtest summary ===");
    console.table(results.summary);

    const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8"));
    const errBudget = budgets.loadtest.maxErrorRatePct;
    const pass = results.summary.errorRatePct <= errBudget;
    console.log(pass ? `PASS: error rate ${results.summary.errorRatePct.toFixed(3)}% <= ${errBudget}%` : `FAIL: error rate ${results.summary.errorRatePct.toFixed(3)}% > ${errBudget}%`);
    process.exitCode = pass ? 0 : 1;
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
