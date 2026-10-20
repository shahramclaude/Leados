import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { publishEvent, getEventsSince, subscribe } from "@/lib/eventBus";
import { createTestUser, deleteTestUser } from "./helpers";

let userId: string;

before(async () => {
  const user = await createTestUser("eventbus-test");
  userId = user.id;
});

after(async () => {
  await deleteTestUser(userId);
});

test("published events are durable and resumable via getEventsSince", async () => {
  const e1 = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: 1 } });
  const e2 = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: 2 } });
  const e3 = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: 3 } });

  const sinceZero = await getEventsSince(userId, 0);
  assert.ok(sinceZero.length >= 3);

  const sinceE1 = await getEventsSince(userId, e1.id);
  assert.deepEqual(
    sinceE1.map((e) => e.id),
    [e2.id, e3.id],
  );

  const sinceLatest = await getEventsSince(userId, e3.id);
  assert.equal(sinceLatest.length, 0);
});

test("live subscribers receive events published after they attach", async () => {
  const received: number[] = [];
  const unsubscribe = subscribe(userId, (event) => received.push(event.id));

  const event = await publishEvent({ userId, type: "task.updated", domain: "test", payload: {} });
  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(received, [event.id]);
  unsubscribe();

  await publishEvent({ userId, type: "task.updated", domain: "test", payload: {} });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(received, [event.id], "no more events should arrive after unsubscribe");
});
