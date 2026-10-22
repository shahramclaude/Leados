// LEADOS — Part 38: declared vs. actual config/schema drift.
//
// "Declared" config is what the registry/schema files in this repo say
// should exist (checks, feature flags, expected DB columns). "Actual" is
// what is currently live in the database. A diff between the two catches
// drift such as: a check removed from the registry file but still enabled
// in the DB, a feature flag the code no longer references, or a column the
// schema file dropped but the live table still has (or vice versa).

import { db } from "@/db";
import { assuranceChecks, featureFlags } from "@/db/schema";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { SEED_FLAGS } from "@/lib/featureFlags";
import { sql } from "drizzle-orm";

export interface ConfigDiffEntry {
  kind: "check" | "feature_flag" | "column";
  key: string;
  issue: "declared_but_missing" | "actual_but_undeclared" | "mismatched";
  detail: string;
}

export async function diffChecksRegistry(): Promise<ConfigDiffEntry[]> {
  const diffs: ConfigDiffEntry[] = [];
  const actual = await db.select().from(assuranceChecks);
  const actualIds = new Set(actual.map((c) => c.id));
  const declaredIds = new Set(CHECK_REGISTRY.map((c: { id: string }) => c.id));

  for (const check of CHECK_REGISTRY) {
    if (!actualIds.has(check.id)) {
      diffs.push({
        kind: "check",
        key: check.id,
        issue: "declared_but_missing",
        detail: `Check '${check.id}' is declared in the registry file but not synced into the database.`,
      });
    }
  }
  for (const row of actual) {
    if (!declaredIds.has(row.id)) {
      diffs.push({
        kind: "check",
        key: row.id,
        issue: "actual_but_undeclared",
        detail: `Check '${row.id}' exists in the database but is no longer declared in the registry file.`,
      });
    }
  }
  return diffs;
}

export async function diffFeatureFlags(): Promise<ConfigDiffEntry[]> {
  const diffs: ConfigDiffEntry[] = [];
  const actual = await db.select().from(featureFlags);
  const actualKeys = new Set(actual.map((f) => f.key));
  const declaredKeys = new Set(SEED_FLAGS.map((f) => f.key));

  for (const flag of SEED_FLAGS) {
    if (!actualKeys.has(flag.key)) {
      diffs.push({
        kind: "feature_flag",
        key: flag.key,
        issue: "declared_but_missing",
        detail: `Feature flag '${flag.key}' is declared but missing from the database.`,
      });
    }
  }
  for (const row of actual) {
    if (!declaredKeys.has(row.key)) {
      diffs.push({
        kind: "feature_flag",
        key: row.key,
        issue: "actual_but_undeclared",
        detail: `Feature flag '${row.key}' exists in the database but is not declared in code.`,
      });
    }
  }
  return diffs;
}

const EXPECTED_TABLES = [
  "assurance_checks",
  "scheduler_jobs",
  "metric_observations",
  "metric_baselines",
  "assurance_runs",
  "drift_series",
  "feature_flags",
  "remediation_actions",
  "findings",
  "notifications",
  "audit_log",
  "nightly_reports",
  "board_pack_rollups",
  "blind_spot_entries",
];

export async function diffSchemaTables(): Promise<ConfigDiffEntry[]> {
  const diffs: ConfigDiffEntry[] = [];
  const result = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public'`,
  );
  const actualTables = new Set(result.rows.map((r) => r.table_name));
  for (const table of EXPECTED_TABLES) {
    if (!actualTables.has(table)) {
      diffs.push({
        kind: "column",
        key: table,
        issue: "declared_but_missing",
        detail: `Table '${table}' is declared in src/db/schema.ts but missing from the live database (run drizzle-kit push).`,
      });
    }
  }
  return diffs;
}

export async function fullConfigDiff(): Promise<ConfigDiffEntry[]> {
  const [checks, flags, tables] = await Promise.all([
    diffChecksRegistry(),
    diffFeatureFlags(),
    diffSchemaTables(),
  ]);
  return [...checks, ...flags, ...tables];
}

/**
 * Computes the live config/schema diff count right now and records it as a
 * `config.diff_count` observation (baseline 0 — a fully reconciled system
 * has zero diffs). Called once per bootstrap/cycle so the
 * `config-schema-drift` check always has a fresh, real number to evaluate.
 */
export async function recordConfigDiffObservation() {
  const { ensureBaseline, recordObservation } = await import("@/lib/metrics");
  await ensureBaseline("config.diff_count", "config", 0);
  const diffs = await fullConfigDiff();
  await recordObservation({
    metricKey: "config.diff_count",
    domain: "config",
    value: diffs.length,
    meta: { diffs },
  });
  return diffs;
}
