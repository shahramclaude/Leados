// Integration-level tests against the real SSE route handler (invoked
// in-process, no HTTP server needed — Next.js route handlers are plain
// Request -> Response functions). Covers:
//   1. Reconnect-after-drop resumes with zero lost/duplicated events.
//   2. A connection storm (many concurrent subscribers) does not crash the
//      server and every connection receives the broadcast event.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { GET as streamGET } from "@/app/api/events/stream/route";
import { publishEvent, getTotalActiveConnections, getActiveConnectionCount } from "@/lib/eventBus";
import { createTestUser, deleteTestUser, makeRequest, openSseReader, readUntil, waitUntil } from "./helpers";

const createdUserIds: string[] = [];
async function newUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  return user.id;
}

after(async () => {
  await Promise.all(createdUserIds.map((id) => deleteTestUser(id)));
});

function hasEventId(buffer: string, id: number): boolean {
  return new RegExp(`^id: ${id}$`, "m").test(buffer);
}

test("reconnect after a network drop resumes without losing events", async () => {
  const userId = await newUser("stream-reconnect");

  const controller1 = new AbortController();
  const req1 = makeRequest("http://localhost/api/events/stream", { userId, signal: controller1.signal });
  const res1 = await streamGET(req1);
  const reader1 = openSseReader(res1);

  // Drain the "connected" preamble, then wait for the route handler to
  // actually finish attaching its live subscriber before publishing.
  await readUntil(reader1, (buf) => buf.includes("event: connected"), 1000);
  await waitUntil(() => getActiveConnectionCount(userId) >= 1);

  const eventA = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: "A" } });
  const chunk1 = await readUntil(reader1, (buf) => hasEventId(buf, eventA.id), 2000);
  assert.ok(hasEventId(chunk1, eventA.id), "first connection should receive event A live");

  // Simulate a network drop: abort the first connection's request signal.
  controller1.abort();
  await waitUntil(() => getActiveConnectionCount(userId) === 0);

  // While "disconnected", more events happen that must not be lost.
  const eventB = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: "B" } });
  const eventC = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: "C" } });

  // Reconnect with Last-Event-ID set to the last event actually seen (A).
  const controller2 = new AbortController();
  const req2 = makeRequest("http://localhost/api/events/stream", {
    userId,
    lastEventId: eventA.id,
    signal: controller2.signal,
  });
  const res2 = await streamGET(req2);
  const reader2 = openSseReader(res2);
  const chunk2 = await readUntil(reader2, (buf) => hasEventId(buf, eventB.id) && hasEventId(buf, eventC.id), 2000);

  assert.ok(hasEventId(chunk2, eventB.id), "resume must include the missed event B");
  assert.ok(hasEventId(chunk2, eventC.id), "resume must include the missed event C");
  assert.ok(!hasEventId(chunk2, eventA.id), "resume must not re-deliver event A (already seen)");

  controller2.abort();
  await waitUntil(() => getActiveConnectionCount(userId) === 0);
});

test("connection storm: many concurrent subscribers all receive a broadcast and the server stays healthy", async () => {
  const userId = await newUser("stream-storm");
  const CONNECTIONS = 50;
  const controllers: AbortController[] = Array.from({ length: CONNECTIONS }, () => new AbortController());

  const responses = await Promise.all(
    controllers.map((c) => streamGET(makeRequest("http://localhost/api/events/stream", { userId, signal: c.signal }))),
  );
  assert.equal(responses.filter((r) => r.status === 200).length, CONNECTIONS);

  const readers = responses.map((r) => openSseReader(r));

  // Let every connection past its "connected" preamble, then wait for all of
  // them to finish attaching their live subscription.
  await Promise.all(readers.map((r) => readUntil(r, (buf) => buf.includes("event: connected"), 1000)));
  await waitUntil(() => getActiveConnectionCount(userId) === CONNECTIONS);
  assert.equal(getTotalActiveConnections(), CONNECTIONS);

  const broadcast = await publishEvent({ userId, type: "metric.anomaly", domain: "test", payload: { storm: true } });

  const chunks = await Promise.all(readers.map((r) => readUntil(r, (buf) => hasEventId(buf, broadcast.id), 3000)));
  const receivedCount = chunks.filter((c) => hasEventId(c, broadcast.id)).length;

  assert.equal(receivedCount, CONNECTIONS, "every connection in the storm must receive the broadcast event");

  controllers.forEach((c) => c.abort());
  await waitUntil(() => getActiveConnectionCount(userId) === 0);
  assert.equal(getActiveConnectionCount(userId), 0, "all connections should clean up after abort");
});
