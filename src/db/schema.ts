// LEADOS — Part 38: Continuous Assurance
//
// This schema is the backbone for the continuous-assurance (nightly
// assurance / drift / remediation) subsystem. Several upstream systems this
// part depends on (Part 04 calibration, Part 09 fairness, Part 12 retrieval
// eval, Part 14 notifications, Part 15 feature flags, Part 19
// security/audit, Part 30 learning loop, Part 33 AI control room, Part 34
// data quality) do not exist yet in this sandbox repository. Rather than
// silently inventing a parallel system, the tables below are named and
// shaped so that when those parts land for real, their outputs can be
// written into `metric_observations` / `feature_flags` / `audit_log`
// directly and this module keeps working unmodified. Until then, the
// shim libraries under `src/lib/*` seed realistic observations so every
// check in the registry has something real to evaluate.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Assurance checks registry (Phase 1)
// ---------------------------------------------------------------------------
export const assuranceChecks = pgTable("assurance_checks", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(), // intelligence | fairness | cost | data | config | security | retrieval
  name: text("name").notNull(),
  method: text("method").notNull(),
  cadence: text("cadence").notNull(), // hourly | daily | weekly
  thresholds: jsonb("thresholds").notNull(), // { warn: number, breach: number, direction: "above"|"below" }
  onBreach: text("on_breach").notNull(), // finding | auto_fix | degrade | alert
  metricKeys: jsonb("metric_keys").notNull().$type<string[]>(),
  blindSpots: jsonb("blind_spots").notNull().$type<string[]>(),
  relatedPart: text("related_part").notNull(),
  featureFlagKey: text("feature_flag_key"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Scheduler job ledger (Part 10) — makes cycle execution idempotent
// ---------------------------------------------------------------------------
export const schedulerJobs = pgTable(
  "scheduler_jobs",
  {
    id: serial("id").primaryKey(),
    jobKey: text("job_key").notNull(), // e.g. "assurance:nightly"
    cycleKey: text("cycle_key").notNull(), // e.g. "2026-02-14" or "2026-W07"
    status: text("status").notNull(), // running | completed | failed
    checksRun: integer("checks_run").notNull().default(0),
    budget: integer("budget").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    result: jsonb("result"),
  },
  (t) => [uniqueIndex("scheduler_jobs_job_cycle_uidx").on(t.jobKey, t.cycleKey)],
);

// ---------------------------------------------------------------------------
// Metric observations — the raw time series every drift detector reads.
// Stands in for the real-time metrics Parts 04/09/12/33/34 would emit.
// ---------------------------------------------------------------------------
export const metricObservations = pgTable(
  "metric_observations",
  {
    id: serial("id").primaryKey(),
    metricKey: text("metric_key").notNull(),
    domain: text("domain").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    value: real("value").notNull(),
    windowLabel: text("window_label"), // e.g. "daily-2026-02-14"
    meta: jsonb("meta"),
  },
  (t) => [index("metric_observations_key_time_idx").on(t.metricKey, t.observedAt)],
);

// ---------------------------------------------------------------------------
// Metric baselines — Part 04-style baselines each check compares against
// ---------------------------------------------------------------------------
export const metricBaselines = pgTable("metric_baselines", {
  metricKey: text("metric_key").primaryKey(),
  domain: text("domain").notNull(),
  baselineValue: real("baseline_value").notNull(),
  baselineWindow: jsonb("baseline_window"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Assurance run results (one row per check execution)
// ---------------------------------------------------------------------------
export const assuranceRuns = pgTable(
  "assurance_runs",
  {
    id: serial("id").primaryKey(),
    checkId: text("check_id").notNull(),
    cycleKey: text("cycle_key").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull(), // pass | warn | breach | error
    metricValue: real("metric_value"),
    baselineValue: real("baseline_value"),
    details: jsonb("details"),
  },
  (t) => [
    uniqueIndex("assurance_runs_check_cycle_uidx").on(t.checkId, t.cycleKey),
    index("assurance_runs_check_time_idx").on(t.checkId, t.runAt),
  ],
);

// ---------------------------------------------------------------------------
// Drift series — CUSUM/EWMA outputs per metric per window
// ---------------------------------------------------------------------------
export const driftSeries = pgTable(
  "drift_series",
  {
    id: serial("id").primaryKey(),
    checkId: text("check_id").notNull(),
    metricKey: text("metric_key").notNull(),
    domain: text("domain").notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull().defaultNow(),
    value: real("value").notNull(),
    baseline: real("baseline").notNull(),
    ewma: real("ewma").notNull(),
    ewmaUcl: real("ewma_ucl").notNull(),
    ewmaLcl: real("ewma_lcl").notNull(),
    cusumPos: real("cusum_pos").notNull(),
    cusumNeg: real("cusum_neg").notNull(),
    cusumThreshold: real("cusum_threshold").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    method: text("method").notNull(), // "ewma" | "cusum" | "both"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drift_series_check_time_idx").on(t.checkId, t.windowEnd)],
);

// ---------------------------------------------------------------------------
// Feature flags registry (Part 15) — needed for the "degrade" remediation tier
// ---------------------------------------------------------------------------
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  degraded: boolean("degraded").notNull().default(false),
  degradedReason: text("degraded_reason"),
  degradedByCheckId: text("degraded_by_check_id"),
  degradedAt: timestamp("degraded_at", { withTimezone: true }),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
  owner: text("owner").notNull().default("platform-team"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Remediation actions — tiered, audited, reversible
// ---------------------------------------------------------------------------
export const remediationActions = pgTable(
  "remediation_actions",
  {
    id: serial("id").primaryKey(),
    checkId: text("check_id").notNull(),
    runId: integer("run_id"),
    tier: text("tier").notNull(), // safe_auto_fix | degrade | escalate
    action: text("action").notNull(),
    status: text("status").notNull(), // applied | reverted | failed | escalated
    reversible: boolean("reversible").notNull().default(true),
    reverseOfId: integer("reverse_of_id"),
    featureFlagKey: text("feature_flag_key"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
  },
  (t) => [index("remediation_actions_check_time_idx").on(t.checkId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Findings — the escalation tier's output (feeds Part 14 notifications)
// ---------------------------------------------------------------------------
export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  checkId: text("check_id"),
  source: text("source").notNull(),
  severity: text("severity").notNull(), // info | warn | high | critical
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Notifications (Part 14 stub)
// ---------------------------------------------------------------------------
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull().default("ops"),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  findingId: integer("finding_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Audit log — hash-chained, verified by `npm run audit:verify` (Part 19)
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    seq: integer("seq").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("audit_log_seq_uidx").on(t.seq)],
);

// ---------------------------------------------------------------------------
// Nightly assurance reports (versioned) + monthly board-pack rollups
// ---------------------------------------------------------------------------
export const nightlyReports = pgTable(
  "nightly_reports",
  {
    id: serial("id").primaryKey(),
    reportDate: text("report_date").notNull(), // YYYY-MM-DD
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("nightly_reports_date_version_uidx").on(t.reportDate, t.version)],
);

export const boardPackRollups = pgTable(
  "board_pack_rollups",
  {
    id: serial("id").primaryKey(),
    monthKey: text("month_key").notNull(), // YYYY-MM
    version: integer("version").notNull(),
    summary: jsonb("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("board_pack_rollups_month_version_uidx").on(t.monthKey, t.version)],
);

// ---------------------------------------------------------------------------
// Central "blind spots" register — maintained as data, not prose, so the
// Blind Spots surface is an honest standing view rather than a one-off doc.
// ---------------------------------------------------------------------------
export const blindSpotEntries = pgTable("blind_spot_entries", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(), // "system" | "check:<id>" | "metric:<key>"
  domain: text("domain").notNull(),
  description: text("description").notNull(),
  whyUnavoidable: text("why_unavoidable").notNull(),
  mitigation: text("mitigation"),
  relatedPart: text("related_part"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
