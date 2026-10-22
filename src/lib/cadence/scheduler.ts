// LEADOS Part 25 — ritual scheduler.
//
// DURABLE-RUN STAND-IN NOTE (Phase 0 finding, see src/db/schema.ts header):
// the brief asks for this to run "on Part 10's durable runs". The upstream
// repository's task-engine candidate (`src/lib/kernel/*`, labeled "Part 07 —
// Orchestration Kernel" in its own header) references DB tables
// (`kernelJobs`, `kernelWorkItems`, …) that do not exist in the upstream
// schema that is actually live, and "Part 10" itself was never found as a
// buildable module anywhere in the repository (only a narrow `reviewTasks`
// stub seam exists, created by Part 23). Rather than importing code that
// cannot run, this scheduler implements its own minimal durable-run
// contract: idempotency is enforced by a UNIQUE(ritualId, occurrenceKey)
// database constraint (`ritual_occurrence_uniq`), so calling `runCadenceTick`
// twice for the same org at the same moment — or replaying it after a crash
// — can never create a duplicate occurrence. This is the literal meaning of
// "idempotent per occurrence" and is enforced at the DB layer, not just in
// application logic.
import { db } from "@/db";
import { agendaItems, eventLog, ritualOccurrences } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { listRituals } from "./graph";
import { nextOccurrence } from "./occurrenceClock";
import { synthesizeAgenda } from "./agendaSynthesizer";
import { getPriorOccurrenceSummaries, resolveCadenceMode } from "./policyEngine";
import type { Ritual } from "./types";

export interface TickResult {
  ritualId: string;
  ritualName: string;
  occurrenceId: string | null;
  occurrenceKey: string | null;
  created: boolean;
  cadenceMode: string | null;
  agendaItemCount: number;
  note: string;
}

/** A single idempotent tick: for every active ritual in `orgId`, if an
 * occurrence is due at-or-before `now` and does not already exist, create it
 * and synthesize its agenda. Safe to call on every request, a short-interval
 * cron, or after a crash — re-running never duplicates work. */
export async function runCadenceTick(orgId: string, now: Date = new Date()): Promise<TickResult[]> {
  const allRituals = await listRituals(orgId);
  const active = allRituals.filter((r) => r.active);

  // Dependency order: rituals with no dependency first, so a dependent
  // ritual's rollup item can see its dependency's freshly created occurrence
  // in the same tick (best-effort — not required for correctness since the
  // rollup just queries whatever occurrences currently exist).
  const ordered = [...active].sort((a, b) => (a.dependsOnRitualId ? 1 : 0) - (b.dependsOnRitualId ? 1 : 0));

  const results: TickResult[] = [];
  for (const ritual of ordered) {
    results.push(await tickOneRitual(ritual, now));
  }
  return results;
}

function cadenceLookaheadMs(kind: Ritual["kind"]): number {
  switch (kind) {
    case "daily_brief":
      return 2 * 86400000;
    case "weekly_review":
      return 9 * 86400000;
    case "monthly_business_review":
      return 32 * 86400000;
    case "quarterly_strategy":
      return 93 * 86400000;
    case "annual_plan":
      return 367 * 86400000;
  }
}

async function tickOneRitual(ritual: Ritual, now: Date): Promise<TickResult> {
  const [mostRecent] = await db
    .select()
    .from(ritualOccurrences)
    .where(eq(ritualOccurrences.ritualId, ritual.id))
    .orderBy(desc(ritualOccurrences.scheduledFor))
    .limit(1);

  // If this ritual has never fired, bound the search to one cadence-length
  // lookback before `now` (rather than walking forward from the Unix epoch,
  // which would take an unbounded number of daily/weekly steps for an org
  // created years after 1970). If it has fired before, resume exactly where
  // it left off.
  const lookbackMs = cadenceLookaheadMs(ritual.kind);
  const searchFrom = mostRecent
    ? new Date(Math.min(mostRecent.scheduledFor.getTime(), now.getTime()) - 1)
    : new Date(now.getTime() - lookbackMs - 1);
  // Find the occurrence that should exist as of `now`: walk forward from the
  // last known occurrence (or one cadence-length before now) until the
  // candidate's scheduledFor exceeds `now` — the last candidate at-or-before
  // `now` is the due one.
  let candidate = nextOccurrence(ritual.kind, ritual.timezone, ritual.anchor, searchFrom);
  let due: { scheduledFor: Date; occurrenceKey: string } | null = null;
  let guard = 0;
  while (candidate.scheduledFor.getTime() <= now.getTime() && guard < 400) {
    due = candidate;
    candidate = nextOccurrence(ritual.kind, ritual.timezone, ritual.anchor, candidate.scheduledFor);
    guard++;
  }

  if (!due) {
    return {
      ritualId: ritual.id,
      ritualName: ritual.name,
      occurrenceId: null,
      occurrenceKey: null,
      created: false,
      cadenceMode: null,
      agendaItemCount: 0,
      note: `No occurrence of "${ritual.name}" is due yet as of ${now.toISOString()}.`,
    };
  }

  const [existing] = await db
    .select()
    .from(ritualOccurrences)
    .where(and(eq(ritualOccurrences.ritualId, ritual.id), eq(ritualOccurrences.occurrenceKey, due.occurrenceKey)))
    .limit(1);

  if (existing) {
    return {
      ritualId: ritual.id,
      ritualName: ritual.name,
      occurrenceId: existing.id,
      occurrenceKey: existing.occurrenceKey,
      created: false,
      cadenceMode: existing.cadenceMode,
      agendaItemCount: await countAgendaItems(existing.id),
      note: `Occurrence ${due.occurrenceKey} for "${ritual.name}" already exists (idempotent no-op).`,
    };
  }

  const priorSummaries = await getPriorOccurrenceSummaries(ritual.id, null, 12);
  const cadenceDecision = await resolveCadenceMode(ritual.id, ritual.orgId, due.occurrenceKey, priorSummaries);

  // Insert with onConflictDoNothing as a second idempotency belt-and-braces
  // layer in case of a concurrent tick racing this one.
  const inserted = await db
    .insert(ritualOccurrences)
    .values({
      ritualId: ritual.id,
      orgId: ritual.orgId,
      occurrenceKey: due.occurrenceKey,
      scheduledFor: due.scheduledFor,
      status: "scheduled",
      cadenceMode: cadenceDecision.mode,
      cadenceReason: cadenceDecision.reason,
    })
    .onConflictDoNothing({ target: [ritualOccurrences.ritualId, ritualOccurrences.occurrenceKey] })
    .returning();

  const occurrenceRow =
    inserted[0] ??
    (
      await db
        .select()
        .from(ritualOccurrences)
        .where(and(eq(ritualOccurrences.ritualId, ritual.id), eq(ritualOccurrences.occurrenceKey, due.occurrenceKey)))
        .limit(1)
    )[0];

  const windowStart = mostRecent?.scheduledFor ?? new Date(due.scheduledFor.getTime() - 30 * 86400000);
  const drafts = await synthesizeAgenda({ ritual, windowStart, windowEnd: due.scheduledFor });

  if (inserted[0]) {
    // Only this tick actually created the row — persist its agenda. If a
    // concurrent tick won the race, we deliberately do not insert a second
    // copy of the agenda (idempotency).
    let rank = 1;
    for (const draft of drafts) {
      await db.insert(agendaItems).values({
        occurrenceId: occurrenceRow.id,
        rank: rank++,
        itemType: draft.itemType,
        title: draft.title,
        whyOnAgenda: draft.whyOnAgenda,
        evidenceRefs: draft.evidenceRefs,
        sourceValue: draft.sourceValue === null ? null : String(draft.sourceValue),
        thresholdValue: draft.thresholdValue === null ? null : String(draft.thresholdValue),
        severity: draft.severity,
      });
    }

    const varianceItems = drafts.filter((d) => d.itemType === "kr_drift" || d.itemType === "budget_variance");
    const maxVariancePct = varianceItems.reduce((max, d) => {
      if (d.sourceValue === null || d.thresholdValue === null || d.thresholdValue === 0) return max;
      const pct = Math.abs(((d.sourceValue - d.thresholdValue) / Math.abs(d.thresholdValue)) * 100);
      return Math.max(max, pct);
    }, 0);
    const anomalyCount = drafts.filter((d) => d.itemType === "anomaly").length;

    await db
      .update(ritualOccurrences)
      .set({ status: "agenda_generated", varianceSnapshot: { variancePct: Math.round(maxVariancePct * 100) / 100, anomalyCount } })
      .where(eq(ritualOccurrences.id, occurrenceRow.id));

    await db.insert(eventLog).values({
      orgId: ritual.orgId,
      entityType: "ritual_occurrence",
      entityId: occurrenceRow.id,
      type: "cadence.occurrence_created",
      payload: {
        ritualId: ritual.id,
        occurrenceKey: due.occurrenceKey,
        cadenceMode: cadenceDecision.mode,
        cadenceReason: cadenceDecision.reason,
        agendaItemCount: drafts.length,
      },
    });
  }

  return {
    ritualId: ritual.id,
    ritualName: ritual.name,
    occurrenceId: occurrenceRow.id,
    occurrenceKey: due.occurrenceKey,
    created: Boolean(inserted[0]),
    cadenceMode: occurrenceRow.cadenceMode,
    agendaItemCount: drafts.length,
    note: inserted[0]
      ? `Created occurrence ${due.occurrenceKey} for "${ritual.name}" with ${drafts.length} agenda item(s), cadence=${cadenceDecision.mode}.`
      : `Occurrence ${due.occurrenceKey} for "${ritual.name}" was created concurrently (idempotent no-op on this call).`,
  };
}

async function countAgendaItems(occurrenceId: string): Promise<number> {
  const rows = await db.select().from(agendaItems).where(eq(agendaItems.occurrenceId, occurrenceId));
  return rows.length;
}
