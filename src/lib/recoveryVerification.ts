// LEADOS — Part 35 resilience lab: recovery re-verification.
//
// After ANY recovery (restart, restore-from-backup, manual repair), the
// system must not simply assume it worked — it re-derives counts/checksums
// from the live data and compares them against a snapshot taken before the
// incident. This is what "Recovery re-verification automation" in the brief
// refers to, and gate (4) requires it to catch a seeded post-recovery
// inconsistency.
//
// Depends on: src/db/schema.ts (recoverableRecords, recoverySnapshots,
// recoveryVerifications).

import { db } from "@/db";
import { recoverableRecords, recoverySnapshots, recoveryVerifications } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";

async function computeChecksum(): Promise<{ count: number; checksum: string }> {
  const rows = await db
    .select({ id: recoverableRecords.id, externalRef: recoverableRecords.externalRef, amount: recoverableRecords.amount })
    .from(recoverableRecords)
    .orderBy(recoverableRecords.id);

  const hash = crypto.createHash("sha256");
  for (const row of rows) {
    hash.update(`${row.id}:${row.externalRef}:${row.amount}|`);
  }
  return { count: rows.length, checksum: hash.digest("hex") };
}

export async function seedRecoverableLedger(n = 20) {
  await db.delete(recoverableRecords);
  const values = Array.from({ length: n }).map((_, i) => ({
    externalRef: `LED-${1000 + i}`,
    amount: Math.round((50 + i * 3.5) * 100) / 100,
  }));
  await db.insert(recoverableRecords).values(values);
}

export async function takeRecoverySnapshot(label: string) {
  const { count, checksum } = await computeChecksum();
  const [row] = await db
    .insert(recoverySnapshots)
    .values({ label, expectedCount: count, expectedChecksum: checksum })
    .returning();
  return row;
}

/** Simulates an operator fat-finger: silently deletes or mutates a row. */
export async function simulateCorruption(mode: "delete" | "mutate") {
  const rows = await db.select({ id: recoverableRecords.id }).from(recoverableRecords).limit(1);
  if (rows.length === 0) return { applied: false };
  const targetId = rows[rows.length - 1]?.id ?? rows[0].id;
  if (mode === "delete") {
    await db.delete(recoverableRecords).where(eq(recoverableRecords.id, targetId));
  } else {
    await db
      .update(recoverableRecords)
      .set({ amount: sql`${recoverableRecords.amount} + 999` })
      .where(eq(recoverableRecords.id, targetId));
  }
  return { applied: true, targetId, mode };
}

export async function runRecoveryVerification(snapshotId: number, label: string) {
  const [snapshot] = await db
    .select()
    .from(recoverySnapshots)
    .where(eq(recoverySnapshots.id, snapshotId));
  if (!snapshot) throw new Error(`no recovery snapshot ${snapshotId}`);

  const { count: actualCount, checksum: actualChecksum } = await computeChecksum();
  const consistent = actualCount === snapshot.expectedCount && actualChecksum === snapshot.expectedChecksum;

  const discrepancies: Record<string, unknown> = {};
  if (actualCount !== snapshot.expectedCount) {
    discrepancies.countDelta = actualCount - snapshot.expectedCount;
  }
  if (actualChecksum !== snapshot.expectedChecksum) {
    discrepancies.checksumMismatch = true;
  }

  const [row] = await db
    .insert(recoveryVerifications)
    .values({
      snapshotId,
      label,
      expectedCount: snapshot.expectedCount,
      actualCount,
      expectedChecksum: snapshot.expectedChecksum,
      actualChecksum,
      consistent,
      discrepancies: Object.keys(discrepancies).length > 0 ? discrepancies : null,
    })
    .returning();

  return row;
}
