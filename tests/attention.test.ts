import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateAttention } from "@/lib/attention/attention";
import { getBudgetState } from "@/lib/attention/budget";
import { createNotification } from "@/lib/notifications";
import { db } from "@/db";
import { notificationPreferences, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestUser, deleteTestUser, setAwakeAllDay } from "./helpers";

let userId: string;

before(async () => {
  const user = await createTestUser("attn-test");
  userId = user.id;
  await setAwakeAllDay(userId); // deterministic: no quiet-hours interference
});

after(async () => {
  await deleteTestUser(userId);
});

test("low severity never interrupts, routes to digest", async () => {
  const decision = await evaluateAttention({ userId, domain: "revenue", severity: 2 });
  assert.equal(decision.decision, "digest");
  assert.match(decision.reason, /below the interrupt threshold/);
});

test("severity 5 without opt-in still routes to digest", async () => {
  const decision = await evaluateAttention({ userId, domain: "security", severity: 5 });
  assert.equal(decision.decision, "digest");
});

test("severity 5 with opt-in interrupts and spends budget", async () => {
  await db
    .insert(notificationPreferences)
    .values({ userId, domain: "security", channel: "in_app", enabled: true, allowInterrupt: true });

  const before1 = await getBudgetState(userId);
  const decision = await evaluateAttention({ userId, domain: "security", severity: 5 });
  assert.equal(decision.decision, "interrupt");
  const after1 = await getBudgetState(userId);
  assert.equal(after1.used, before1.used + 1);
});

test("daily interrupt budget is enforced — once exhausted, falls back to digest", async () => {
  const state = await getBudgetState(userId);
  const remaining = state.remaining;
  for (let i = 0; i < remaining; i++) {
    const d = await evaluateAttention({ userId, domain: "security", severity: 5 });
    assert.equal(d.decision, "interrupt", `expected interrupt #${i + 1} while budget remains`);
  }
  const exhausted = await getBudgetState(userId);
  assert.equal(exhausted.remaining, 0);

  const overflow = await evaluateAttention({ userId, domain: "security", severity: 5 });
  assert.equal(overflow.decision, "digest");
  assert.match(overflow.reason, /budget exhausted/);
});

test("disabled domain preference suppresses notifications entirely", async () => {
  await db
    .insert(notificationPreferences)
    .values({ userId, domain: "noisy", channel: "in_app", enabled: false, allowInterrupt: false });
  const decision = await evaluateAttention({ userId, domain: "noisy", severity: 5 });
  assert.equal(decision.decision, "suppressed");
});

test("notification dedup: repeated root cause bumps occurrence instead of creating duplicates", async () => {
  const dedupKey = `test-dedup-${userId}`;
  const first = await createNotification({
    userId,
    type: "metric.anomaly",
    domain: "reliability",
    severity: 3,
    title: "Anomaly A",
    body: "first occurrence",
    dedupKey,
  });
  assert.equal(first.deduped, false);
  assert.equal(first.notification.occurrenceCount, 1);

  const second = await createNotification({
    userId,
    type: "metric.anomaly",
    domain: "reliability",
    severity: 3,
    title: "Anomaly A",
    body: "second occurrence",
    dedupKey,
  });
  assert.equal(second.deduped, true);
  assert.equal(second.notification.id, first.notification.id);
  assert.equal(second.notification.occurrenceCount, 2);

  const third = await createNotification({
    userId,
    type: "metric.anomaly",
    domain: "reliability",
    severity: 3,
    title: "Anomaly A",
    body: "third occurrence",
    dedupKey,
  });
  assert.equal(third.notification.occurrenceCount, 3);

  const rows = await db.select().from(notifications).where(eq(notifications.dedupKey, dedupKey));
  assert.equal(rows.length, 1, "exactly one notification row must exist for this root cause");
});

test("alarm storm: 20 identical-cause events collapse into a single notification", async () => {
  const dedupKey = `storm-${userId}`;
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      createNotification({
        userId,
        type: "metric.anomaly",
        domain: "reliability",
        severity: 3,
        title: "Storm anomaly",
        body: `occurrence ${i}`,
        dedupKey,
      }),
    ),
  );
  const rows = await db.select().from(notifications).where(eq(notifications.dedupKey, dedupKey));
  assert.equal(rows.length, 1, "alarm storm must dedup to exactly one notification row");
  assert.equal(rows[0].occurrenceCount, 20);
});
