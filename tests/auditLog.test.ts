import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { db, pool } from "../src/db";
import { auditEvents } from "../src/db/schema";
import { appendAuditEvent, verifyAuditChain } from "../src/lib/auditLog";
import { sql } from "drizzle-orm";

test("hash chain verifies as valid after legitimate appends, and detects a seeded tamper", async () => {
  // Isolate this test's events so it doesn't depend on whatever else is in the table.
  await appendAuditEvent({ actorKind: "system", actorId: "test", action: "test-event-1", target: "t1" });
  await appendAuditEvent({ actorKind: "system", actorId: "test", action: "test-event-2", target: "t2" });

  const before = await verifyAuditChain();
  assert.equal(before.valid, true, "chain must verify before tampering");

  // Seeded tamper: flip one byte of a historical event's target field directly in the DB,
  // bypassing the application layer entirely (exactly the attack PHASE 5 describes).
  const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
  const victim = rows[rows.length - 2] ?? rows[0];
  await db.execute(sql`update audit_events set target = 'TAMPERED' where id = ${victim.id}`);

  const after = await verifyAuditChain();
  assert.equal(after.valid, false, "tamper must be detected");
  assert.equal(after.brokenAtSeq, victim.seq, "break must be reported at the tampered sequence number");

  // Restore so repeated test runs stay clean.
  await db.execute(sql`update audit_events set target = ${victim.target} where id = ${victim.id}`);
  await pool.end();
});
