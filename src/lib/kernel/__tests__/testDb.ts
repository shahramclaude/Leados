import { db } from "@/db";
import { sql } from "drizzle-orm";

const KERNEL_TABLES = [
  "kernel_events",
  "kernel_outbox",
  "kernel_findings",
  "kernel_metric_readings",
  "kernel_policy_versions",
  "kernel_capability_overrides",
  "kernel_delegations",
  "kernel_active_rules",
  "kernel_runs",
  "kernel_steps",
  "kernel_plan_type_dry_runs",
  "kernel_locks",
  "kernel_approvals",
  "kernel_budgets",
  "kernel_circuit_breakers",
  "kernel_dead_letters",
  "kernel_kill_switch",
  "kernel_domain_pauses",
  "kernel_work_items",
  "kernel_golden_cases",
  "kernel_self_improve_proposals",
  "kernel_jobs",
  "kernel_job_runs",
];

export async function resetKernelTables(): Promise<void> {
  const tables = KERNEL_TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`));
}
