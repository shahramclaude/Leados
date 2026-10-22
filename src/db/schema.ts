// LEADOS — Part 35: Resilience & Chaos Engineering schema.
//
// NOTE ON THIS SANDBOX: the repository snapshot available while building this
// part contains only the bare Next.js/Drizzle starter — none of Part 10
// (scheduler), Part 18 (queue), Part 20 (runbooks/SLO service), Part 29 (risk
// register), Part 06 (shock models), Part 12 (playbooks) or Part 28 (process
// mining) artifacts are present. Part 35 therefore ships its own
// representation of the pieces it needs (a local risk register, a local
// critical-process list, a local SLO config) clearly namespaced so a future
// merge with the real Part 10/18/20/29 tables is a rename, not a rewrite.
// This is called out again in RESILIENCE.md and AI-SESSION-LOG.md.

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
  real,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Phase 0 — failure domain inventory (the program's own object of study)
// ---------------------------------------------------------------------------
export const failureDomains = pgTable("resilience_failure_domains", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  currentProtection: text("current_protection").notNull(),
  untestedAssumption: text("untested_assumption").notNull(),
  chaosTestable: boolean("chaos_testable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Risk register (Part 29 stand-in) — assumptions become tested beliefs
// ---------------------------------------------------------------------------
export const riskRegisterEntries = pgTable("resilience_risk_register", {
  id: serial("id").primaryKey(),
  domainKey: varchar("domain_key", { length: 64 }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  belief: varchar("belief", { length: 24 }).notNull().default("untested"), // untested | tested_holds | tested_broken
  likelihood: varchar("likelihood", { length: 16 }).notNull().default("unknown"), // low|medium|high|unknown
  impact: varchar("impact", { length: 16 }).notNull().default("unknown"),
  owner: text("owner").notNull(),
  sourceExperimentKey: varchar("source_experiment_key", { length: 64 }),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Chaos experiment catalog + run transcripts
// ---------------------------------------------------------------------------
export const chaosExperiments = pgTable("resilience_chaos_experiments", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  title: text("title").notNull(),
  domainKey: varchar("domain_key", { length: 64 }).notNull(),
  hypothesis: text("hypothesis").notNull(),
  injectionType: varchar("injection_type", { length: 32 }).notNull(),
  // process_kill | latency | error_rate | dependency_outage | corrupt_payload | clock_skew
  blastRadius: varchar("blast_radius", { length: 16 }).notNull().default("test"), // test|staging|production
  steadyStateSlo: jsonb("steady_state_slo").notNull(),
  rollbackPlan: text("rollback_plan").notNull(),
  safetyPolicy: jsonb("safety_policy").notNull(),
  schedule: varchar("schedule", { length: 32 }).notNull().default("quarterly"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chaosRuns = pgTable("resilience_chaos_runs", {
  id: serial("id").primaryKey(),
  experimentKey: varchar("experiment_key", { length: 64 }).notNull(),
  environment: varchar("environment", { length: 16 }).notNull().default("test"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  injectionDetail: jsonb("injection_detail").notNull(),
  steadyStateBefore: jsonb("steady_state_before").notNull(),
  steadyStateDuring: jsonb("steady_state_during").notNull(),
  steadyStateAfter: jsonb("steady_state_after"),
  outcome: varchar("outcome", { length: 16 }).notNull(), // passed | failed | aborted
  observed: text("observed").notNull(),
  conclusion: text("conclusion").notNull(),
  rolledBack: boolean("rolled_back").notNull().default(false),
  thunderingHerdChecked: boolean("thundering_herd_checked").notNull().default(false),
  operator: text("operator").notNull().default("chaos-harness"),
});

export const hardeningTasks = pgTable("resilience_hardening_tasks", {
  id: serial("id").primaryKey(),
  chaosRunId: integer("chaos_run_id").notNull(),
  experimentKey: varchar("experiment_key", { length: 64 }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open|in_progress|done
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Circuit breakers / degraded modes
// ---------------------------------------------------------------------------
export const circuitBreakerStates = pgTable("resilience_circuit_breakers", {
  id: serial("id").primaryKey(),
  dependencyKey: varchar("dependency_key", { length: 64 }).notNull().unique(),
  label: text("label").notNull(),
  state: varchar("state", { length: 16 }).notNull().default("closed"), // closed|open|half_open
  failureCount: integer("failure_count").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastStateChangeAt: timestamp("last_state_change_at", { withTimezone: true }).notNull().defaultNow(),
  degradedModeDescription: text("degraded_mode_description").notNull(),
  userVisibleMessage: text("user_visible_message").notNull(),
});

// ---------------------------------------------------------------------------
// Continuity (operational business continuity, not just IT)
// ---------------------------------------------------------------------------
export const continuityProcesses = pgTable("resilience_continuity_processes", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  criticality: varchar("criticality", { length: 16 }).notNull().default("medium"), // low|medium|high|critical
  rtoMinutes: integer("rto_minutes").notNull(),
  rpoMinutes: integer("rpo_minutes").notNull(),
  workaroundPlaybook: text("workaround_playbook").notNull(),
  owner: text("owner").notNull(),
  lastDrillAt: timestamp("last_drill_at", { withTimezone: true }),
});

export const continuityDrills = pgTable("resilience_continuity_drills", {
  id: serial("id").primaryKey(),
  processKey: varchar("process_key", { length: 64 }).notNull(),
  scenarioKey: varchar("scenario_key", { length: 64 }).notNull(),
  scenarioTitle: text("scenario_title").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  timerSeconds: integer("timer_seconds"),
  participants: text("participants").notNull(),
  afterActionNotes: text("after_action_notes"),
  actionItems: jsonb("action_items"),
  outcome: varchar("outcome", { length: 16 }).notNull().default("in_progress"), // in_progress|completed|aborted
});

// ---------------------------------------------------------------------------
// Recovery re-verification (data-integrity check after any recovery)
// ---------------------------------------------------------------------------
export const recoverySnapshots = pgTable("resilience_recovery_snapshots", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  expectedCount: integer("expected_count").notNull(),
  expectedChecksum: text("expected_checksum").notNull(),
});

export const recoveryVerifications = pgTable("resilience_recovery_verifications", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull(),
  label: text("label").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  expectedCount: integer("expected_count").notNull(),
  actualCount: integer("actual_count").notNull(),
  expectedChecksum: text("expected_checksum").notNull(),
  actualChecksum: text("actual_checksum").notNull(),
  consistent: boolean("consistent").notNull(),
  discrepancies: jsonb("discrepancies"),
});

// ---------------------------------------------------------------------------
// Demo domain data used as the "thing being protected" by the lab:
// a toy ledger of recoverable business records + a clock-skew probe table
// used by the clock-skew chaos experiment (exp-clock-skew).
// ---------------------------------------------------------------------------
export const recoverableRecords = pgTable("resilience_recoverable_records", {
  id: serial("id").primaryKey(),
  externalRef: varchar("external_ref", { length: 64 }).notNull(),
  amount: real("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clockSkewProbes = pgTable("resilience_clock_skew_probes", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull(),
});
