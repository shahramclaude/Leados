// =============================================================================
// LEADOS — Part 25: Operating Rhythm Engine (Cadence Graph, Agenda Synthesis,
// Adaptive Cadence, After-Ritual Capture, Ritual Effectiveness)
// =============================================================================
// STANDING-ORDER NOTE — Phase 0 discovery result (read-before-write):
//
// This working sandbox was handed over as a bare Next.js + Drizzle starter
// (`src/db/schema.ts` exported nothing). Per the standing order this part
// cloned the real https://github.com/shahramclaude/Leados history to read
// before writing. What was actually found there:
//
//   - `src/lib/scheduler.ts` (Part 07 seam comment) and `src/lib/temporal.ts`
//     (header: "LEADOS Part 14 — shared time utilities") DO exist upstream,
//     and were read in full.
//   - `src/lib/zeroFillerLint.ts` (header: "LEADOS Part 14 — zero-filler lint
//     for generated text") exists upstream and is reused VERBATIM below
//     (see src/lib/zeroFillerLint.ts in this delivery — byte-identical to the
//     upstream file, not reinvented).
//   - `src/db/schema.ts` upstream (last written by "Part 23: Decision
//     Operations substrate") defines `orgs`, `users`, `eventLog`, `decisions`
//     + satellite tables, `decisionTriggerWatches`, `sensorSignalReadings`
//     (explicitly flagged there as a Part 13 sensing STUB SEAM) and
//     `reviewTasks` (explicitly flagged there as a Part 10 task-engine STUB
//     SEAM). That table shape is reproduced below unchanged so this part's
//     capture flow writes into the *same* substrate shape Part 23 defined.
//   - CRITICAL FINDING, recorded honestly rather than papered over: the
//     upstream repository is internally inconsistent. `src/lib/kernel/*`
//     (header: "LEADOS Part 07 — Orchestration Kernel") references
//     `kernelJobs`/`kernelWorkItems`/`kernelApprovals`, `src/app/api/work-queue`
//     references `workQueueJobs`, and `src/lib/digest.ts` references
//     `digestQueue` — none of which exist in the upstream `schema.ts` that is
//     actually live (which only has the Part-23 decision tables). The repo
//     root additionally contains a second, unrelated Vite/React app (its own
//     `package.json`, `App.tsx`, `engine.js`, …) with its own `verify` script
//     convention (`vitest run && tsc --noEmit`), coexisting with the Next.js
//     app tree. This means "Part 10's durable runs" and the work-queue API
//     named in this part's brief are NOT in a buildable state upstream today.
//     Rather than wiring against code that cannot run, this part builds its
//     own small, honestly-labeled idempotent occurrence ledger
//     (`ritualOccurrences`, unique on `(ritualId, occurrenceKey)`) as the
//     durable-run stand-in, documented in `src/lib/cadence/scheduler.ts`, and
//     adopts the upstream `verify` script convention (`vitest run && tsc
//     --noEmit`) so this sandbox's `npm run verify` matches what the rest of
//     the repo already expects of that script name.
//
// Everything below this line is genuinely new (Part 25) except the
// `orgs` / `users` / `eventLog` / `decisions*` / `decisionTriggerWatches` /
// `sensorSignalReadings` block, which is reproduced from the real upstream
// Part 23 file so the cadence capture flow is wire-compatible with it.
// =============================================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// -----------------------------------------------------------------------------
// Identity stand-ins (Parts 04/05 substrate stand-in — reproduced from the
// real upstream Part 23 file, unchanged)
// -----------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // e.g. 'lead' | 'manager' | 'ic' | 'exec'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Part 01 substrate stand-in: append-only event log (reproduced from upstream
// Part 23 — this part appends `cadence.*` event types onto the same log)
// -----------------------------------------------------------------------------

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    entityType: text("entity_type").notNull(), // 'decision' | 'ritual' | 'ritual_occurrence' | ...
    entityId: uuid("entity_id"),
    type: text("type").notNull(), // e.g. 'decision.committed', 'cadence.occurrence_created'
    payload: jsonb("payload").notNull().default({}),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEntity: index("event_log_entity_idx").on(t.entityType, t.entityId),
    byOrg: index("event_log_org_idx").on(t.orgId),
  }),
);

// -----------------------------------------------------------------------------
// Decisions — reproduced (trimmed to the fields this part reads/writes) from
// upstream Part 23's "Decision Operations substrate" so captured decisions
// are wire-compatible with that table.
// -----------------------------------------------------------------------------

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    decisionClass: text("decision_class").notNull(),
    status: text("status").notNull().default("raised"), // raised -> framed -> evidence_gathered -> decided -> reviewed
    question: text("question").notNull(),
    decisionType: text("decision_type").notNull().default("type2"), // 'type1' | 'type2'
    optionsConsidered: jsonb("options_considered").notNull().default([]),
    chosen: text("chosen"),
    choiceRationale: text("choice_rationale"),
    expectedOutcome: text("expected_outcome"),
    reviewAt: timestamp("review_at", { withTimezone: true }),
    impact: integer("impact").notNull().default(3), // 1-5, explicit input
    raisedBy: uuid("raised_by"),
    // Provenance back into the cadence substrate (Part 25 addition — nullable
    // so decisions raised outside a ritual remain valid).
    sourceRitualOccurrenceId: uuid("source_ritual_occurrence_id"),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgStatus: index("decisions_org_status_idx").on(t.orgId, t.status),
  }),
);

// Trigger watches — evaluated against signal readings (Part 13 stub seam
// below). Reproduced from upstream Part 23. Source of agenda item type
// "open decisions near trigger thresholds".
export const decisionTriggerWatches = pgTable("decision_trigger_watches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  thresholdOp: text("threshold_op").notNull(), // 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  thresholdValue: numeric("threshold_value").notNull(),
  status: text("status").notNull().default("watching"), // 'watching' | 'breached' | 'resolved'
  lastValue: numeric("last_value"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  breachedAt: timestamp("breached_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Part 13 (sensing) STUB SEAM — reproduced from upstream Part 23 unchanged.
// Source of agenda item type "anomalies since last ritual".
export const sensorSignalReadings = pgTable(
  "sensor_signal_readings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    signal: text("signal").notNull(),
    value: numeric("value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySignal: index("ssr_signal_idx").on(t.orgId, t.signal),
  }),
);

// -----------------------------------------------------------------------------
// Part 25 — additional substrate the agenda synthesizer reads from. Each is a
// small, honestly-labeled stand-in for a feed named in the brief that has no
// real upstream source yet (KRs, budget lines, aggregate people-pulse).
// -----------------------------------------------------------------------------

// KR drift source (stand-in for a real OKR system).
export const keyResults = pgTable("key_results", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  periodKey: text("period_key").notNull(), // e.g. '2026-Q1'
  target: numeric("target").notNull(),
  current: numeric("current").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Budget variance source (stand-in for a real finance system).
export const budgetLines = pgTable("budget_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  category: text("category").notNull(),
  periodKey: text("period_key").notNull(),
  budgeted: numeric("budgeted").notNull(),
  actual: numeric("actual").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// People signals — AGGREGATE ONLY (per Part 09's privacy rule). There is
// deliberately no per-person row anywhere in this table or any query over
// it; `respondentCount` lets callers enforce a k-anonymity floor before
// display (see src/lib/cadence/agendaSynthesizer.ts MIN_RESPONDENTS_TO_SHOW).
export const teamPulseAggregates = pgTable("team_pulse_aggregates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  teamLabel: text("team_label").notNull(),
  periodKey: text("period_key").notNull(),
  avgScore: numeric("avg_score").notNull(), // 1-5 scale
  respondentCount: integer("respondent_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Outcome-loop entity #1: Actions. Every action MUST have an owner (role
// and/or user) — enforced in src/lib/cadence/capture.ts, not just by
// convention. "Never minutes without owners."
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    ownerRole: text("owner_role"),
    ownerUserId: uuid("owner_user_id"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("open"), // 'open' | 'done'
    sourceRitualOccurrenceId: uuid("source_ritual_occurrence_id"),
    sourceDecisionId: uuid("source_decision_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    byOrgStatus: index("actions_org_status_idx").on(t.orgId, t.status),
    bySourceOccurrence: index("actions_source_occurrence_idx").on(t.sourceRitualOccurrenceId),
  }),
);

// Outcome-loop entity #2: Hypotheses (Part 01/12 substrate stand-in).
export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  statement: text("statement").notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'testing' | 'confirmed' | 'refuted'
  sourceRitualOccurrenceId: uuid("source_ritual_occurrence_id"),
  raisedBy: uuid("raised_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Part 25 — Cadence graph
// -----------------------------------------------------------------------------

export type RitualKind =
  | "daily_brief"
  | "weekly_review"
  | "monthly_business_review"
  | "quarterly_strategy"
  | "annual_plan";

export const rituals = pgTable(
  "rituals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // RitualKind
    name: text("name").notNull(),
    participantRoles: jsonb("participant_roles").notNull().default([]), // string[]
    inputsSpec: jsonb("inputs_spec").notNull().default([]), // SignalRef[]
    outputsSpec: jsonb("outputs_spec").notNull().default([]), // ArtifactRef[]
    durationMinutes: integer("duration_minutes").notNull().default(30),
    quorum: integer("quorum").notNull().default(1),
    timezone: text("timezone").notNull().default("UTC"),
    // Anchor describes the base (undegraded) cadence in wall-clock terms,
    // resolved timezone-correctly by src/lib/cadence/occurrenceClock.ts.
    anchor: jsonb("anchor").notNull(), // { weekday?, dayOfMonth?, month?, hour, minute }
    dependsOnRitualId: uuid("depends_on_ritual_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrg: index("rituals_org_idx").on(t.orgId),
  }),
);

// Adaptive-cadence policy: plain-language rule + a typed, testable condition.
export const cadencePolicies = pgTable("cadence_policies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  ritualId: uuid("ritual_id").notNull().references(() => rituals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(), // plain-language statement of the rule
  rule: jsonb("rule").notNull(), // CadenceRule (src/lib/cadence/types.ts)
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Human overrides of the adaptive-cadence decision — ITSELF logged, per the
// brief's explicit requirement ("a human override that itself is logged").
export const cadenceOverrides = pgTable("cadence_overrides", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  ritualId: uuid("ritual_id").notNull(),
  occurrenceId: uuid("occurrence_id"),
  overrideType: text("override_type").notNull(), // 'force_full' | 'force_async' | 'force_skip' | 'reactivate_policy'
  reason: text("reason").notNull(),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per occurrence of a ritual. Idempotency is enforced at the DB
// level via the unique index below (ritualId, occurrenceKey) — this is the
// "durable run" stand-in documented in src/lib/cadence/scheduler.ts.
export const ritualOccurrences = pgTable(
  "ritual_occurrences",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ritualId: uuid("ritual_id").notNull().references(() => rituals.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(), // e.g. '2026-W07', '2026-03', '2026-Q1'
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    // 'scheduled' | 'agenda_generated' | 'held' | 'degraded_async' | 'skipped' | 'missed'
    cadenceMode: text("cadence_mode").notNull().default("full"), // 'full' | 'async_checklist'
    cadenceReason: text("cadence_reason"), // why the policy engine (or an override) picked this mode
    quorumMet: boolean("quorum_met"),
    attendeeCount: integer("attendee_count"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    // Snapshot of { variancePct, anomalyCount } computed from this
    // occurrence's synthesized agenda, consumed by the next occurrence's
    // adaptive-cadence policy evaluation (src/lib/cadence/policyEngine.ts).
    varianceSnapshot: jsonb("variance_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOccurrence: uniqueIndex("ritual_occurrence_uniq").on(t.ritualId, t.occurrenceKey),
    byOrg: index("ritual_occurrences_org_idx").on(t.orgId),
  }),
);

// Synthesized agenda items for one occurrence — ranked, evidence-linked.
export const agendaItems = pgTable(
  "agenda_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    occurrenceId: uuid("occurrence_id").notNull().references(() => ritualOccurrences.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    itemType: text("item_type").notNull(),
    // 'decision_near_trigger' | 'anomaly' | 'kr_drift' | 'budget_variance' |
    // 'people_signal_aggregate' | 'action_overdue' | 'cadence_rollup'
    title: text("title").notNull(),
    whyOnAgenda: text("why_on_agenda").notNull(), // must pass the zero-filler lint
    evidenceRefs: jsonb("evidence_refs").notNull().default([]), // EvidenceRef[]
    sourceValue: numeric("source_value"),
    thresholdValue: numeric("threshold_value"),
    severity: integer("severity").notNull().default(1), // 1-5
    status: text("status").notNull().default("open"), // 'open' | 'addressed' | 'deferred'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOccurrence: index("agenda_items_occurrence_idx").on(t.occurrenceId, t.rank),
  }),
);

// The After-Ritual Capture record. One per occurrence. Points at the typed
// entities it created — never free-text-only minutes.
export const ritualCaptures = pgTable("ritual_captures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  occurrenceId: uuid("occurrence_id").notNull().references(() => ritualOccurrences.id, { onDelete: "cascade" }).unique(),
  capturedBy: uuid("captured_by"),
  decisionIds: jsonb("decision_ids").notNull().default([]), // string[]
  actionIds: jsonb("action_ids").notNull().default([]), // string[]
  hypothesisIds: jsonb("hypothesis_ids").notNull().default([]), // string[]
  openQuestions: jsonb("open_questions").notNull().default([]), // {question, ownerRole}[]
  notes: text("notes"), // optional addendum; never the record of truth by itself
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Ritual effectiveness — diagnostic only. Measures the ritual, never a
// person: no user-level rollups are stored here, only occurrence-level
// aggregates (see Phase 6 honesty rules).
export const ritualEffectivenessSnapshots = pgTable("ritual_effectiveness_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  occurrenceId: uuid("occurrence_id").notNull().references(() => ritualOccurrences.id, { onDelete: "cascade" }).unique(),
  actionsOpened: integer("actions_opened").notNull().default(0),
  actionsCompleted: integer("actions_completed").notNull().default(0),
  actionCompletionRate: numeric("action_completion_rate"),
  decisionVelocityBeforeHours: numeric("decision_velocity_before_hours"),
  decisionVelocityAfterHours: numeric("decision_velocity_after_hours"),
  decisionVelocityChangePct: numeric("decision_velocity_change_pct"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});
