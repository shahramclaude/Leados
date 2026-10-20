// LEADOS Part 01 — full-fidelity export / validated import.
//
// Export is lossless: it captures raw (non-upcast) event rows exactly as
// stored, the schema-version-per-type registry snapshot active at export
// time, the current materialized projection state (for convenience/debugging
// — NOT authoritative; the events are authoritative), and settings.
//
// Import is: (1) always dry-run first (produces a diff you can show a human
// or assert on in a test) and (2) idempotent by eventId — importing the same
// bundle twice inserts nothing the second time. Importing calls
// rebuildProjections() at the end so projection_state always reflects
// exactly what pure replay of the (now-merged) log produces — see the
// restore-drill verification log entry for a round-trip proof.

import { db } from "@/db";
import { settings } from "@/db/schema";
import { appendEvent } from "@/lib/eventStore";
import { exportAllRawRows, insertRawEvent, listEventIds } from "@/lib/platform/eventRepository";
import { listAllProjectionRows } from "@/lib/platform/projectionRepository";
import { rebuildProjections } from "@/lib/projections/engine";
import { ensureProjectorsRegistered } from "@/lib/projections/registerAll";
import { EVENT_SCHEMA_REGISTRY } from "@/lib/events/eventSchema";
import { EVENT_TYPE_IDS, isKnownEventType, type EventTypeId } from "@/lib/events/eventCatalog";
import type { EventEnvelope } from "@/lib/events/types";
import { newUlid } from "@/lib/ulid";

export type ExportBundle = {
  formatVersion: 1;
  exportedAt: string;
  orgId: string;
  schemaVersions: Record<string, number>;
  events: EventEnvelope[];
  projections: Array<{ projectorName: string; entityId: string; orgId: string; state: unknown; updatedAt: string }>;
  settings: Array<{ key: string; value: unknown; updatedAt: string }>;
};

export async function buildExport(orgId: string): Promise<ExportBundle> {
  const [rawEvents, projectionRows, settingsRows] = await Promise.all([
    exportAllRawRows(orgId),
    listAllProjectionRows(),
    db.select().from(settings),
  ]);

  const schemaVersions: Record<string, number> = {};
  for (const type of EVENT_TYPE_IDS) schemaVersions[type] = EVENT_SCHEMA_REGISTRY[type].currentVersion;

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    orgId,
    schemaVersions,
    events: rawEvents,
    projections: projectionRows
      .filter((r) => r.orgId === orgId)
      .map((r) => ({
        projectorName: r.projectorName,
        entityId: r.entityId,
        orgId: r.orgId,
        state: r.state,
        updatedAt: r.updatedAt.toISOString(),
      })),
    settings: settingsRows.map((s) => ({ key: s.key, value: s.value, updatedAt: s.updatedAt.toISOString() })),
  };
}

export type ImportDiff = {
  totalInBundle: number;
  toInsert: number;
  alreadyPresent: number;
  unknownTypes: string[];
  invalidRows: Array<{ eventId: string; type: string; error: string }>;
  safeToCommit: boolean;
};

async function planAndMaybeCommit(bundle: ExportBundle, commit: boolean): Promise<ImportDiff> {
  ensureProjectorsRegistered();
  const unknownTypes = new Set<string>();
  const invalidRows: ImportDiff["invalidRows"] = [];
  let toInsert = 0;
  let alreadyPresent = 0;
  const existingIdsByOrg = new Map<string, Set<string>>();

  for (const envelope of bundle.events) {
    if (!isKnownEventType(envelope.type)) {
      unknownTypes.add(envelope.type);
      continue;
    }
    const schema = EVENT_SCHEMA_REGISTRY[envelope.type as EventTypeId].versions[envelope.schemaVersion];
    if (!schema) {
      invalidRows.push({ eventId: envelope.eventId, type: envelope.type, error: `unknown schemaVersion ${envelope.schemaVersion}` });
      continue;
    }
    const parsed = schema.safeParse(envelope.payload);
    if (!parsed.success) {
      invalidRows.push({ eventId: envelope.eventId, type: envelope.type, error: parsed.error.message });
      continue;
    }
    if (commit) {
      const outcome = await insertRawEvent(db, envelope);
      if (outcome === "inserted") toInsert += 1;
      else alreadyPresent += 1;
    } else {
      // Dry run: we still need to know insert-vs-present without writing.
      let ids = existingIdsByOrg.get(envelope.orgId);
      if (!ids) {
        ids = await listEventIds(envelope.orgId);
        existingIdsByOrg.set(envelope.orgId, ids);
      }
      if (ids.has(envelope.eventId)) alreadyPresent += 1;
      else toInsert += 1;
    }
  }

  const safeToCommit = unknownTypes.size === 0 && invalidRows.length === 0;

  if (commit && safeToCommit) {
    await rebuildProjections();
    await appendEvent({
      type: "system.import_performed",
      orgId: bundle.orgId,
      actor: { kind: "system", id: "import-pipeline" },
      entityId: newUlid(),
      correlationId: newUlid(),
      source: "import",
      payload: {
        importId: newUlid(),
        requestedBy: "import-pipeline",
        summary: { inserted: toInsert, skippedExisting: alreadyPresent },
      },
    });
  }

  return {
    totalInBundle: bundle.events.length,
    toInsert,
    alreadyPresent,
    unknownTypes: Array.from(unknownTypes),
    invalidRows,
    safeToCommit,
  };
}

/** Dry run: validates and diffs, writes nothing. */
export async function planImport(bundle: ExportBundle): Promise<ImportDiff> {
  return planAndMaybeCommit(bundle, false);
}

/** Commits an import. Always re-validates (never trusts a prior dry run
 * blindly) and refuses to write anything if the bundle is not safeToCommit. */
export async function commitImport(bundle: ExportBundle): Promise<ImportDiff> {
  const plan = await planAndMaybeCommit(bundle, false);
  if (!plan.safeToCommit) {
    return plan;
  }
  return planAndMaybeCommit(bundle, true);
}
