// LEADOS — Part 35 resilience lab: operational business continuity.
//
// Stand-in for Part 28's process mining (critical process list) and Part 12's
// manual-workaround playbooks, neither of which are present in this
// repository snapshot. The processes below are a reasonable starting list for
// a lead-generation/CRM product (LEADOS); they should be reconciled against
// Part 28's real mined list when it lands — flagged in RESILIENCE.md.
//
// Depends on: src/db/schema.ts (continuityProcesses, continuityDrills).

import { db } from "@/db";
import { continuityProcesses, continuityDrills } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CriticalProcessSeed = {
  key: string;
  name: string;
  criticality: "low" | "medium" | "high" | "critical";
  rtoMinutes: number;
  rpoMinutes: number;
  workaroundPlaybook: string;
  owner: string;
};

export const CRITICAL_PROCESSES: CriticalProcessSeed[] = [
  {
    key: "lead-sync",
    name: "Lead data sync (core LEADOS ingestion pipeline)",
    criticality: "critical",
    rtoMinutes: 30,
    rpoMinutes: 5,
    workaroundPlaybook:
      "Pause inbound connectors; instruct SDRs to log new leads in the shared offline capture sheet; " +
      "backfill into LEADOS via the bulk importer once the pipeline is restored; reconcile duplicates using externalRef.",
    owner: "Platform Engineering",
  },
  {
    key: "invoicing",
    name: "Customer invoicing",
    criticality: "high",
    rtoMinutes: 240,
    rpoMinutes: 15,
    workaroundPlaybook:
      "Finance issues manual invoices from the last-known-good export (daily finance extract); " +
      "mark affected accounts 'manual-billing' in the CRM so automated invoicing does not double-charge on recovery.",
    owner: "Finance Operations",
  },
  {
    key: "payments",
    name: "Payment processing",
    criticality: "critical",
    rtoMinutes: 60,
    rpoMinutes: 1,
    workaroundPlaybook:
      "Switch checkout to the secondary payment provider (pre-configured failover key); " +
      "queue webhooks for replay; reconcile ledgers via recovery re-verification before resuming primary provider.",
    owner: "Payments Team",
  },
  {
    key: "support-escalation",
    name: "Customer support escalation",
    criticality: "medium",
    rtoMinutes: 120,
    rpoMinutes: 30,
    workaroundPlaybook:
      "Escalate via the on-call phone tree (not just the ticketing tool); " +
      "support leads track escalations in a shared doc until the ticketing system is back, then bulk-import as tickets.",
    owner: "Customer Support",
  },
  {
    key: "nightly-backup",
    name: "Nightly backup & integrity check",
    criticality: "high",
    rtoMinutes: 180,
    rpoMinutes: 1440,
    workaroundPlaybook:
      "If the automated backup job fails, an operator runs the manual pg_dump runbook before end of business, " +
      "stores it in the offsite bucket, and triggers recovery re-verification against the prior snapshot.",
    owner: "Platform Engineering",
  },
];

export type DrillScenario = {
  key: string;
  title: string;
  processKey: string;
  script: string;
};

export const DRILL_SCENARIOS: DrillScenario[] = [
  {
    key: "vendor-down-2-weeks",
    title: "Key vendor (payment provider) down for 2 weeks",
    processKey: "payments",
    script:
      "Inject: primary payment provider returns sustained outage starting 09:00 Monday. " +
      "Expect: team fails over to secondary provider within RTO, reconciles ledgers daily, " +
      "communicates to customers, and does not double-charge on provider recovery.",
  },
  {
    key: "finance-system-offline-month-end",
    title: "Finance system offline at month-end close",
    processKey: "invoicing",
    script:
      "Inject: invoicing system unreachable during the last 3 business days of the month. " +
      "Expect: manual invoicing workaround executed from the last export, affected accounts flagged, " +
      "no duplicate invoices generated once the system returns.",
  },
  {
    key: "db-region-outage",
    title: "Primary database region outage affecting lead sync",
    processKey: "lead-sync",
    script:
      "Inject: primary Postgres region unreachable for 45 minutes during business hours. " +
      "Expect: inbound leads captured via offline sheet, backfilled via bulk importer, " +
      "recovery re-verification run before pipeline resumes automated ingestion.",
  },
  {
    key: "oncall-unreachable",
    title: "Primary on-call engineer unreachable during a live incident",
    processKey: "support-escalation",
    script:
      "Inject: paging the primary on-call fails to get an ack within 10 minutes. " +
      "Expect: secondary on-call is paged automatically, support uses the phone tree, " +
      "after-action captures why the page failed (device, rotation, escalation policy).",
  },
];

export async function seedContinuity() {
  for (const p of CRITICAL_PROCESSES) {
    const existing = await db.select().from(continuityProcesses).where(eq(continuityProcesses.key, p.key));
    if (existing.length === 0) {
      await db.insert(continuityProcesses).values(p);
    }
  }
}

export async function startDrill(scenarioKey: string, participants: string) {
  const scenario = DRILL_SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenario) throw new Error(`unknown drill scenario ${scenarioKey}`);
  const [row] = await db
    .insert(continuityDrills)
    .values({
      processKey: scenario.processKey,
      scenarioKey: scenario.key,
      scenarioTitle: scenario.title,
      participants,
      outcome: "in_progress",
    })
    .returning();
  return row;
}

export async function completeDrill(opts: {
  drillId: number;
  afterActionNotes: string;
  actionItems: { owner: string; item: string; dueInDays: number }[];
  timerSeconds: number;
}) {
  const [row] = await db
    .update(continuityDrills)
    .set({
      endedAt: new Date(),
      timerSeconds: opts.timerSeconds,
      afterActionNotes: opts.afterActionNotes,
      actionItems: opts.actionItems,
      outcome: "completed",
    })
    .where(eq(continuityDrills.id, opts.drillId))
    .returning();

  if (row) {
    await db
      .update(continuityProcesses)
      .set({ lastDrillAt: new Date() })
      .where(eq(continuityProcesses.key, row.processKey));
  }
  return row;
}

export async function listContinuityProcesses() {
  return db.select().from(continuityProcesses).orderBy(continuityProcesses.key);
}

export async function listDrills() {
  return db.select().from(continuityDrills).orderBy(continuityDrills.id);
}
