#!/usr/bin/env node
// Replays deferred writes queued while maintenance mode was on. Thin CLI
// wrapper around POST /api/maintenance/flush (which does the real work via
// src/lib/maintenance.ts#replayDeferredWrites) so it can be run from a
// deploy pipeline step after maintenance is turned off.
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";

async function main() {
  const res = await fetch(`${BASE_URL}/api/maintenance/flush`, {
    method: "POST",
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("flush failed:", body);
    process.exit(1);
  }
  console.log(`Flushed deferred writes: ${JSON.stringify(body)}`);
}

main().catch((err) => {
  console.error("flush-deferred-writes failed:", err);
  process.exit(1);
});
