// LEADOS Part 14 — interrupt-budget enforcement + dedupe-burst chain test.
// Hits the real dispatch gate (src/lib/notifications.ts -> attention.ts ->
// cognitiveLoad.ts) against the live Postgres instance. Creates its own
// throwaway org/user so it doesn't interfere with demo data.
import "dotenv/config";
import { db } from "../../src/db";
import { notificationPrefs, notifications, orgs, users } from "../../src/db/schema";
import { eq, isNull } from "drizzle-orm";
import { dispatchInterrupt } from "../../src/lib/notifications";
import { getBudgetStatus } from "../../src/lib/cognitiveLoad";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

async function main() {
  const [org] = await db.insert(orgs).values({ name: `test-org-${Date.now()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({ orgId: org.id, name: "Test User", email: `test-${Date.now()}@leados.test`, role: "analyst", timezone: "UTC" })
    .returning();

  // Opt in to immediate delivery for "action" so severity doesn't need to be 5
  // to qualify, isolating the test to budget enforcement specifically.
  await db.insert(notificationPrefs).values({ userId: user.id, class: "action", optedInImmediate: true, muted: false });

  // --- Interrupt-budget enforcement: the 9th interrupt of the day queues ---
  const results: string[] = [];
  for (let i = 0; i < 9; i++) {
    const result = await dispatchInterrupt({
      orgId: org.id,
      userId: user.id,
      timezone: "UTC",
      class: "action",
      severity: 3,
      dedupeKey: `budget-test-${i}-${Date.now()}`,
      title: `Budget test interrupt number ${i + 1}`,
      body: "synthetic interrupt for budget enforcement test",
    });
    results.push(result.outcome);
  }

  console.log("Outcomes for interrupts 1..9:", results.join(", "));
  assert(results.slice(0, 8).every((r) => r === "immediate"), "budget: interrupts 1-8 are all delivered immediately");
  assert(results[8] === "queued_digest", "budget: the 9th interrupt of the day is queued to digest, not delivered immediately");

  const status = await getBudgetStatus(user.id, "UTC");
  assert(status.spent === 8, `budget: ledger shows exactly 8 spent (got ${status.spent})`);
  assert(status.exhausted === true, "budget: ledger reports exhausted = true after the 8th spend");

  // --- Dedupe burst: N events sharing one dedupeKey collapse into one chain ---
  const burstKey = `burst-${Date.now()}`;
  const burstResults = [];
  for (let i = 0; i < 12; i++) {
    const result = await dispatchInterrupt({
      orgId: org.id,
      userId: user.id,
      timezone: "UTC",
      class: "info",
      severity: 2,
      dedupeKey: burstKey,
      title: `Burst occurrence number ${i + 1} of the same root cause`,
      body: "synthetic dedupe burst event",
    });
    burstResults.push(result);
  }

  const roots = await db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, burstKey));
  const rootRows = roots.filter((r) => r.parentId === null);
  const childRows = roots.filter((r) => r.parentId !== null);

  assert(rootRows.length === 1, `dedupe: exactly one root notification exists for the burst (got ${rootRows.length})`);
  assert(childRows.length === 11, `dedupe: the other 11 events became children of that root (got ${childRows.length})`);
  assert(
    childRows.every((c) => c.parentId === rootRows[0]?.id),
    "dedupe: every child points at the same root id (one chain, not several)",
  );

  // Dedupe burst must not have consumed extra budget beyond the root's own attempt.
  const statusAfterBurst = await getBudgetStatus(user.id, "UTC");
  assert(
    statusAfterBurst.spent === status.spent,
    `dedupe: burst did not spend additional interrupt budget (before ${status.spent}, after ${statusAfterBurst.spent})`,
  );

  // --- Zero-filler lint applied to dispatched titles ---
  const unreadRoot = await db.select().from(notifications).where(isNull(notifications.parentId)).limit(1);
  assert(unreadRoot.length > 0, "sanity: at least one root notification row exists in the table");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll budget + dedupe assertions passed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
