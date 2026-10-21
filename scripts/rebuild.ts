// `npm run db:rebuild` — rebuilds every projection from the immutable event
// log, from empty, and proves it is deterministic by doing it twice and
// comparing checksums. This is also the replay-equivalence check for
// snapshots: for every entity with a snapshot, fold(events) must equal
// fold(snapshot + tail).
//
// IMPORTANT: this script only ever truncates *projection* tables
// (entity_projections, snapshots, projection_checkpoints) and resets the
// outbox to `pending`. It never touches `events` — the event log is the only
// source of truth and is never rewritten.

import "dotenv/config";
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import { processPendingOutbox } from "../src/lib/platform/events/projector";
import { fold } from "../src/lib/projections/entityProjection";
import { loadEntityEvents, rowToEnvelope } from "../src/lib/platform/events/eventStore";

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortKeys((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

async function checksumProjections(): Promise<string> {
  const rows = await db.select().from(schema.entityProjections).orderBy(asc(schema.entityProjections.orgId), asc(schema.entityProjections.entityType), asc(schema.entityProjections.entityId));
  const normalized = rows.map((r) => ({
    orgId: r.orgId,
    entityType: r.entityType,
    entityId: r.entityId,
    version: r.version,
    deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    data: r.data,
  }));
  return createHash("sha256").update(canonicalize(normalized)).digest("hex");
}

async function resetProjections(): Promise<void> {
  await db.delete(schema.snapshots);
  await db.delete(schema.projectionCheckpoints);
  await db.delete(schema.entityProjections);
  await db.update(schema.outbox).set({ status: "pending", processedAt: null });
}

async function rebuildOnce(): Promise<string> {
  await resetProjections();
  let totalProcessed = 0;
  for (;;) {
    const { processed } = await processPendingOutbox(db);
    totalProcessed += processed;
    if (processed === 0) break;
  }
  console.log(`  projector applied ${totalProcessed} outbox rows`);
  return checksumProjections();
}

async function verifyReplayEquivalence(): Promise<{ checked: number; failures: string[] }> {
  const snapshotRows = await db.select().from(schema.snapshots);
  const failures: string[] = [];
  for (const snap of snapshotRows) {
    const fullEvents = await loadEntityEvents(db, snap.orgId, snap.entityType, snap.entityId, 0);
    const viaFullFold = fold(fullEvents);

    const tailEvents = await loadEntityEvents(db, snap.orgId, snap.entityType, snap.entityId, snap.lastSeq);
    const snapshotState = snap.state as { data: Record<string, unknown>; version: number; validFrom: string; validTo: string | null; deletedAt: string | null };
    const viaSnapshotPlusTail = fold(
      tailEvents,
      {
        entityType: snap.entityType,
        entityId: snap.entityId,
        orgId: snap.orgId,
        version: snapshotState.version,
        validFrom: snapshotState.validFrom,
        validTo: snapshotState.validTo,
        deletedAt: snapshotState.deletedAt,
        data: snapshotState.data,
      },
    );

    const a = canonicalize(viaFullFold);
    const b = canonicalize(viaSnapshotPlusTail);
    if (a !== b) failures.push(`${snap.orgId}/${snap.entityType}/${snap.entityId}`);
  }
  return { checked: snapshotRows.length, failures };
}

async function main() {
  console.log("Pass 1/2: rebuilding projections from empty...");
  const checksum1 = await rebuildOnce();
  console.log(`  checksum1=${checksum1}`);

  console.log("Pass 2/2: rebuilding projections from empty again...");
  const checksum2 = await rebuildOnce();
  console.log(`  checksum2=${checksum2}`);

  const rebuildOk = checksum1 === checksum2;
  console.log(rebuildOk ? "PASS: rebuild is deterministic (checksums match)" : "FAIL: rebuild checksums differ");

  console.log("Checking replay-equivalence (fold(events) === fold(snapshot + tail)) for all snapshotted entities...");
  const { checked, failures } = await verifyReplayEquivalence();
  console.log(`  checked ${checked} snapshots, ${failures.length} failures`);
  if (failures.length) console.log("  failing entities:", failures.join(", "));

  const ok = rebuildOk && failures.length === 0;
  console.log(ok ? "\ndb:rebuild RESULT: PASS" : "\ndb:rebuild RESULT: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

void eq;
