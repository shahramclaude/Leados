// LEADOS Part 14 — HTTP-level realtime tests against a running server.
// Requires SERVER_URL env var pointing at a running `next start` instance
// (see scripts/verify.mjs, which boots one on a throwaway port for this).
//
// Covers:
//  1. kill/reconnect: zero lost frames, order preserved (sequence assertion)
//  2. 500-connection storm: stability + resource numbers
//  3. scoping: role-invisible frames never delivered over the wire
import "dotenv/config";
import { db } from "../../src/db";
import { orgs, users } from "../../src/db/schema";

const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:3100";

// Frames must be emitted from WITHIN the running server process (the
// realtime bus is in-process), so the test drives emission through the
// dev-only /api/dev/emit endpoint rather than calling appendEvent/publishFrame
// directly from this separate test process.
async function emitFrame(orgId: string, topic: string, type: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SERVER_URL}/api/dev/emit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, topic, type, payload }),
  });
  const data = await res.json();
  return data.frame as { id: string };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

interface ParsedFrame {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

async function readFrames(
  userId: string,
  role: string,
  opts: { lastEventId?: string; maxFrames: number; timeoutMs: number },
): Promise<ParsedFrame[]> {
  const qs = new URLSearchParams({ userId, role });
  if (opts.lastEventId) qs.set("lastEventId", opts.lastEventId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const res = await fetch(`${SERVER_URL}/api/events/stream?${qs.toString()}`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: ParsedFrame[] = [];
  try {
    while (frames.length < opts.maxFrames) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.trim() || part.startsWith(":")) continue;
        const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          frames.push(JSON.parse(dataLine.slice(5).trim()));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // aborted/timeout — return what we have
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return frames;
}

async function testReconnectNoLoss(orgId: string, userId: string, role: string) {
  console.log("\n--- Reconnect / no-loss test ---");

  // Connect, read the first 3 of a batch of 10 frames we're about to emit,
  // then "kill" the connection (abort) and reconnect with Last-Event-ID to
  // prove we get the remaining 7 with no gaps and correct order.
  const topic = `org:${orgId}:role:${role}`;
  const emittedIds: string[] = [];

  const readerPromise = readFrames(userId, role, { maxFrames: 3, timeoutMs: 4000 });
  await new Promise((r) => setTimeout(r, 300)); // let the connection open first

  for (let i = 0; i < 10; i++) {
    const frame = await emitFrame(orgId, topic, "finding", { seq: i });
    emittedIds.push(frame.id);
    await new Promise((r) => setTimeout(r, 30));
  }

  const firstBatch = await readerPromise;
  assert(firstBatch.length > 0, "reconnect: first connection received at least one frame before being cut off");

  const lastSeen = firstBatch.at(-1)!.id;
  const secondBatch = await readFrames(userId, role, { lastEventId: lastSeen, maxFrames: 50, timeoutMs: 2500 });

  const allReceivedIds = [...firstBatch.map((f) => f.id), ...secondBatch.map((f) => f.id)];
  const uniqueIds = new Set(allReceivedIds);

  const expectedTail = emittedIds.filter((id) => BigInt(id) > BigInt(lastSeen));
  const gotTailIds = secondBatch.filter((f) => f.type === "finding").map((f) => f.id);

  assert(expectedTail.every((id) => uniqueIds.has(id)), "reconnect: every frame emitted after the cutoff is present after resume (zero loss)");
  assert(uniqueIds.size === allReceivedIds.length, "reconnect: no duplicate frame ids across both connections");

  const numericIds = allReceivedIds.map((id) => BigInt(id));
  const sorted = [...numericIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert(numericIds.every((id, i) => id === sorted[i]), "reconnect: frame ids arrive in strictly increasing order across reconnect");
  assert(gotTailIds.length >= expectedTail.length, `reconnect: resumed connection delivered >= ${expectedTail.length} tail frames (got ${gotTailIds.length})`);
}

async function testScoping(orgId: string, managerId: string, analystId: string) {
  console.log("\n--- Role-scoping test ---");
  const analystTopic = `org:${orgId}:role:analyst`;

  const managerReaderPromise = readFrames(managerId, "manager", { maxFrames: 1, timeoutMs: 1500 });
  await new Promise((r) => setTimeout(r, 300));

  const frame = await appendEvent({ orgId, topic: analystTopic, type: "finding", payload: { secret: "analyst-only" } });
  publishFrame(frame);

  const managerFrames = await managerReaderPromise;
  const leaked = managerFrames.some((f) => f.payload?.secret === "analyst-only");
  assert(!leaked, "scoping: a frame scoped to role:analyst is never delivered to a role:manager connection");
}

async function testStorm(orgId: string, role: string) {
  console.log("\n--- 500-connection storm test ---");
  const CONNECTIONS = 500;
  const startRss = process.memoryUsage().rss;
  const start = Date.now();

  const controllers: AbortController[] = [];
  let opened = 0;
  let failed = 0;

  const openOne = async (i: number) => {
    const controller = new AbortController();
    controllers.push(controller);
    try {
      const res = await fetch(`${SERVER_URL}/api/events/stream?userId=storm-${i}&role=${role}`, { signal: controller.signal });
      if (res.ok && res.body) {
        opened++;
        // Just touch the reader so the connection is actually established,
        // then leave it open (reading in background) to simulate a real
        // idle client under the storm.
        const reader = res.body.getReader();
        void (async () => {
          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // closed on cleanup
          }
        })();
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  };

  const batchSize = 50;
  for (let i = 0; i < CONNECTIONS; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, CONNECTIONS - i) }, (_, j) => openOne(i + j));
    await Promise.all(batch);
  }

  const elapsedMs = Date.now() - start;
  await new Promise((r) => setTimeout(r, 500));
  const endRss = process.memoryUsage().rss;

  // Publish one broadcast frame and confirm the server stays responsive
  // (health check) while 500 connections are open.
  const healthRes = await fetch(`${SERVER_URL}/api/health`);
  assert(healthRes.ok, "storm: server still answers /api/health with 500 connections open");

  console.log(
    `storm: opened ${opened}/${CONNECTIONS} connections in ${elapsedMs}ms, failed ${failed}, client RSS before=${(startRss / 1e6).toFixed(1)}MB after=${(
      endRss / 1e6
    ).toFixed(1)}MB`,
  );
  assert(opened >= CONNECTIONS * 0.95, `storm: at least 95% of ${CONNECTIONS} connections opened successfully (got ${opened})`);

  for (const c of controllers) c.abort();
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const [org] = await db.insert(orgs).values({ name: `http-test-org-${Date.now()}` }).returning();
  const [manager] = await db
    .insert(users)
    .values({ orgId: org.id, name: "HTTP Test Manager", email: `httpmgr-${Date.now()}@leados.test`, role: "manager", timezone: "UTC" })
    .returning();
  const [analyst] = await db
    .insert(users)
    .values({ orgId: org.id, name: "HTTP Test Analyst", email: `httpan-${Date.now()}@leados.test`, role: "analyst", timezone: "UTC" })
    .returning();

  await testReconnectNoLoss(org.id, analyst.id, "analyst");
  await testScoping(org.id, manager.id, analyst.id);
  await testStorm(org.id, "analyst");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll HTTP realtime assertions passed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
