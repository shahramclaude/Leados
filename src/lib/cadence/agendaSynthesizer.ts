// LEADOS Part 25 — agenda synthesis over real signals.
//
// Every agenda item is sourced from a real row in the substrate (Parts
// 07/13/23-shaped tables read during this part's discovery, reproduced in
// src/db/schema.ts) and carries evidence links + a "why on agenda" line that
// must pass the zero-filler lint (src/lib/zeroFillerLint.ts, reused verbatim
// from Part 14). If a source has nothing to report, it contributes ZERO
// items — there is no placeholder "nothing to report" item type. An empty
// agenda is represented by an empty array, not a fabricated entry.
import { db } from "@/db";
import {
  actions,
  budgetLines,
  decisionTriggerWatches,
  keyResults,
  ritualOccurrences,
  sensorSignalReadings,
  teamPulseAggregates,
} from "@/db/schema";
import { and, eq, gte, lt, lte } from "drizzle-orm";
import { assertNoFiller } from "@/lib/zeroFillerLint";
import type { AgendaItemDraft, Ritual } from "./types";

/** k-anonymity floor for displaying any people-signal aggregate (Part 09 rule). */
export const MIN_RESPONDENTS_TO_SHOW = 5;

const PROXIMITY_FOR_AGENDA = 0.15; // within 15% of its trigger threshold
const KR_DRIFT_THRESHOLD_PCT = 10;
const BUDGET_VARIANCE_THRESHOLD_PCT = 5;
const ANOMALY_Z_THRESHOLD = 2;
const PULSE_LOW_BAND = 3.0; // out of 5

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sourceDecisionsNearTrigger(orgId: string): Promise<AgendaItemDraft[]> {
  const rows = await db
    .select()
    .from(decisionTriggerWatches)
    .where(and(eq(decisionTriggerWatches.orgId, orgId), eq(decisionTriggerWatches.status, "watching")));

  const items: AgendaItemDraft[] = [];
  for (const row of rows) {
    const last = row.lastValue === null ? null : Number(row.lastValue);
    const threshold = Number(row.thresholdValue);
    if (last === null || threshold === 0) continue;
    const proximity = Math.abs(last - threshold) / Math.abs(threshold);
    if (proximity > PROXIMITY_FOR_AGENDA) continue;
    const pct = round2(proximity * 100);
    const why = `Signal "${row.signal}" is at ${last}, within ${pct}% of its ${row.thresholdOp} ${threshold} trigger threshold.`;
    assertNoFiller(why, "agenda item: decision_near_trigger");
    items.push({
      itemType: "decision_near_trigger",
      title: `Decision trigger approaching: ${row.signal}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "decision", id: row.decisionId, note: `watch ${row.id}` }, { type: "decision_trigger_watch", id: row.id, note: `last=${last}, threshold=${threshold}` }],
      sourceValue: last,
      thresholdValue: threshold,
      severity: proximity <= 0.05 ? 5 : proximity <= 0.1 ? 4 : 3,
    });
  }
  return items;
}

async function sourceAnomalies(orgId: string, windowStart: Date, windowEnd: Date): Promise<AgendaItemDraft[]> {
  const baseline = await db
    .select()
    .from(sensorSignalReadings)
    .where(and(eq(sensorSignalReadings.orgId, orgId), lt(sensorSignalReadings.observedAt, windowStart)));
  const recent = await db
    .select()
    .from(sensorSignalReadings)
    .where(
      and(
        eq(sensorSignalReadings.orgId, orgId),
        gte(sensorSignalReadings.observedAt, windowStart),
        lte(sensorSignalReadings.observedAt, windowEnd),
      ),
    );

  const baselineBySignal = new Map<string, number[]>();
  for (const row of baseline) {
    const arr = baselineBySignal.get(row.signal) ?? [];
    arr.push(Number(row.value));
    baselineBySignal.set(row.signal, arr);
  }

  const items: AgendaItemDraft[] = [];
  for (const row of recent) {
    const history = baselineBySignal.get(row.signal);
    if (!history || history.length < 3) continue; // not enough baseline to call it an anomaly
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) continue;
    const value = Number(row.value);
    const z = (value - mean) / stddev;
    if (Math.abs(z) < ANOMALY_Z_THRESHOLD) continue;
    const why = `Signal "${row.signal}" read ${value} (${round2(z)} standard deviations from its ${history.length}-sample baseline mean of ${round2(mean)}).`;
    assertNoFiller(why, "agenda item: anomaly");
    items.push({
      itemType: "anomaly",
      title: `Anomaly: ${row.signal}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "sensor_signal_reading", id: row.id, note: `z=${round2(z)}` }],
      sourceValue: value,
      thresholdValue: round2(mean + Math.sign(z) * ANOMALY_Z_THRESHOLD * stddev),
      severity: Math.abs(z) >= 4 ? 5 : Math.abs(z) >= 3 ? 4 : 3,
    });
  }
  return items;
}

async function sourceKrDrift(orgId: string): Promise<AgendaItemDraft[]> {
  const rows = await db.select().from(keyResults).where(eq(keyResults.orgId, orgId));
  const items: AgendaItemDraft[] = [];
  for (const row of rows) {
    const target = Number(row.target);
    const current = Number(row.current);
    if (target === 0) continue;
    const driftPct = ((current - target) / Math.abs(target)) * 100;
    if (Math.abs(driftPct) < KR_DRIFT_THRESHOLD_PCT) continue;
    const why = `KR "${row.name}" is at ${current} vs a target of ${target} — ${round2(Math.abs(driftPct))}% drift for period ${row.periodKey}.`;
    assertNoFiller(why, "agenda item: kr_drift");
    items.push({
      itemType: "kr_drift",
      title: `KR drift: ${row.name}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "key_result", id: row.id, note: `period ${row.periodKey}` }],
      sourceValue: current,
      thresholdValue: target,
      severity: Math.abs(driftPct) >= 25 ? 5 : Math.abs(driftPct) >= 15 ? 4 : 3,
    });
  }
  return items;
}

async function sourceBudgetVariance(orgId: string): Promise<AgendaItemDraft[]> {
  const rows = await db.select().from(budgetLines).where(eq(budgetLines.orgId, orgId));
  const items: AgendaItemDraft[] = [];
  for (const row of rows) {
    const budgeted = Number(row.budgeted);
    const actual = Number(row.actual);
    if (budgeted === 0) continue;
    const variancePct = ((actual - budgeted) / Math.abs(budgeted)) * 100;
    if (Math.abs(variancePct) < BUDGET_VARIANCE_THRESHOLD_PCT) continue;
    const why = `Budget line "${row.category}" (${row.periodKey}) is at $${actual} actual vs $${budgeted} budgeted — ${round2(Math.abs(variancePct))}% variance.`;
    assertNoFiller(why, "agenda item: budget_variance");
    items.push({
      itemType: "budget_variance",
      title: `Budget variance: ${row.category}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "budget_line", id: row.id, note: `period ${row.periodKey}` }],
      sourceValue: actual,
      thresholdValue: budgeted,
      severity: Math.abs(variancePct) >= 25 ? 5 : Math.abs(variancePct) >= 15 ? 4 : 3,
    });
  }
  return items;
}

async function sourcePeopleSignals(orgId: string): Promise<AgendaItemDraft[]> {
  const rows = await db.select().from(teamPulseAggregates).where(eq(teamPulseAggregates.orgId, orgId));
  const items: AgendaItemDraft[] = [];
  for (const row of rows) {
    if (row.respondentCount < MIN_RESPONDENTS_TO_SHOW) continue; // k-anonymity floor — never show small-n aggregates
    const avg = Number(row.avgScore);
    if (avg >= PULSE_LOW_BAND) continue;
    const why = `Team "${row.teamLabel}" pulse averaged ${round2(avg)}/5 across ${row.respondentCount} aggregated responses for ${row.periodKey} (no individual responses are exposed).`;
    assertNoFiller(why, "agenda item: people_signal_aggregate");
    items.push({
      itemType: "people_signal_aggregate",
      title: `Team pulse below band: ${row.teamLabel}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "team_pulse_aggregate", id: row.id, note: `n=${row.respondentCount}` }],
      sourceValue: avg,
      thresholdValue: PULSE_LOW_BAND,
      severity: avg <= 2 ? 5 : avg <= 2.5 ? 4 : 3,
    });
  }
  return items;
}

async function sourceOverdueActions(orgId: string, now: Date): Promise<AgendaItemDraft[]> {
  const rows = await db
    .select()
    .from(actions)
    .where(and(eq(actions.orgId, orgId), eq(actions.status, "open")));
  const items: AgendaItemDraft[] = [];
  for (const row of rows) {
    if (!row.dueAt || row.dueAt.getTime() >= now.getTime()) continue;
    const daysOverdue = Math.ceil((now.getTime() - row.dueAt.getTime()) / 86400000);
    const owner = row.ownerRole ?? "unassigned-role";
    const why = `Action "${row.title}" (owner: ${owner}) is ${daysOverdue} day(s) overdue (due ${row.dueAt.toISOString().slice(0, 10)}).`;
    assertNoFiller(why, "agenda item: action_overdue");
    items.push({
      itemType: "action_overdue",
      title: `Overdue: ${row.title}`,
      whyOnAgenda: why,
      evidenceRefs: [{ type: "action", id: row.id, note: `${daysOverdue}d overdue` }],
      sourceValue: daysOverdue,
      thresholdValue: 0,
      severity: daysOverdue >= 14 ? 5 : daysOverdue >= 7 ? 4 : daysOverdue >= 3 ? 3 : 2,
    });
  }
  return items;
}

async function sourceCadenceRollup(ritual: Ritual, windowStart: Date, windowEnd: Date): Promise<AgendaItemDraft[]> {
  if (!ritual.dependsOnRitualId) return [];
  const rows = await db
    .select()
    .from(ritualOccurrences)
    .where(
      and(
        eq(ritualOccurrences.ritualId, ritual.dependsOnRitualId),
        gte(ritualOccurrences.scheduledFor, windowStart),
        lte(ritualOccurrences.scheduledFor, windowEnd),
      ),
    );
  if (rows.length === 0) return [];
  const held = rows.filter((r) => r.status === "held" || r.status === "degraded_async").length;
  const skipped = rows.filter((r) => r.status === "skipped" || r.status === "missed").length;
  const why = `${held} of ${rows.length} dependent occurrence(s) were held this period (${skipped} skipped/missed).`;
  assertNoFiller(why, "agenda item: cadence_rollup");
  return [
    {
      itemType: "cadence_rollup",
      title: "Dependent ritual rollup",
      whyOnAgenda: why,
      evidenceRefs: rows.map((r) => ({ type: "ritual_occurrence", id: r.id, note: r.status })),
      sourceValue: held,
      thresholdValue: rows.length,
      severity: skipped > 0 ? 3 : 1,
    },
  ];
}

export interface SynthesizeAgendaParams {
  ritual: Ritual;
  windowStart: Date; // start of the lookback window (typically the previous occurrence's scheduledFor)
  windowEnd: Date; // typically the current occurrence's scheduledFor ("now" for this ritual)
}

/** Produces ranked agenda item drafts (rank is assigned by the caller once
 * persisted, based on severity desc then item-type order). */
export async function synthesizeAgenda({ ritual, windowStart, windowEnd }: SynthesizeAgendaParams): Promise<AgendaItemDraft[]> {
  const [decisionsNear, anomalies, krDrift, budgetVariance, peopleSignals, overdueActions, rollup] = await Promise.all([
    sourceDecisionsNearTrigger(ritual.orgId),
    sourceAnomalies(ritual.orgId, windowStart, windowEnd),
    sourceKrDrift(ritual.orgId),
    sourceBudgetVariance(ritual.orgId),
    sourcePeopleSignals(ritual.orgId),
    sourceOverdueActions(ritual.orgId, windowEnd),
    sourceCadenceRollup(ritual, windowStart, windowEnd),
  ]);

  const all = [...decisionsNear, ...anomalies, ...krDrift, ...budgetVariance, ...peopleSignals, ...overdueActions, ...rollup];
  all.sort((a, b) => b.severity - a.severity);
  return all;
}
