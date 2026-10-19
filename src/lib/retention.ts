// src/lib/retention.ts
//
// Per-event-type retention policies (seeded into `retention_policies` from
// `eventCatalog.ts` defaults — see src/db/seed.ts). `runRetentionPurge()`
// finds events older than their type's retention window that are marked
// `purgeable: true` and redacts their payload (never deletes the row —
// see the append-only rationale in docs/DATA.md §2/§7 and the DB trigger
// in drizzle/0001_events_append_only_guard.sql). The row, its id, type,
// domain, timestamps and causal links all survive so the shape of history
// (and any projections already computed from it) is undisturbed; only the
// payload content is cleared.

import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { redactEventPayload } from "@/lib/events/eventStore";
import { getRetentionPolicy, recordAudit } from "@/lib/repositories/auditRepository";
import { EVENT_CATALOG } from "@/lib/events/eventCatalog";

export interface RetentionPurgeReport {
  scannedTypes: string[];
  eventsRedacted: number;
  runAt: string;
}

const TOMBSTONE = { purged: true, reason: "retention-policy-expired" } as const;

export async function runRetentionPurge(actorId = "system"): Promise<RetentionPurgeReport> {
  let eventsRedacted = 0;
  const scannedTypes: string[] = [];

  for (const type of Object.keys(EVENT_CATALOG)) {
    const policy = (await getRetentionPolicy(type)) ?? defaultPolicyFor(type);
    if (!policy.purgeable || policy.retentionDays == null) continue;
    scannedTypes.push(type);

    const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
    const candidates = await db
      .select()
      .from(events)
      .where(and(eq(events.type, type), eq(events.redacted, false), lt(events.ts, cutoff)));

    for (const row of candidates) {
      const result = await redactEventPayload(row.id, () => ({ ...TOMBSTONE }));
      if (result) eventsRedacted += 1;
    }
  }

  const runAt = new Date().toISOString();
  await recordAudit("retention_purge", { scannedTypes, eventsRedacted }, { actorId });
  return { scannedTypes, eventsRedacted, runAt };
}

function defaultPolicyFor(type: string): { retentionDays: number | null; purgeable: boolean } {
  const entry = EVENT_CATALOG[type as keyof typeof EVENT_CATALOG];
  return { retentionDays: entry?.retentionDays ?? null, purgeable: entry?.purgeable ?? false };
}
