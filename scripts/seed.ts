// Seeds demo users, prefs, policy tables, and a handful of domain objects so
// the Now surface, notifications, and attention engine all have something
// real to show immediately. Safe to re-run (idempotent upserts / guards).
//
// Run with: npx tsx scripts/seed.ts

import { db } from "@/db";
import {
  approvals,
  findings,
  notificationPrefs,
  users,
  workQueueItems,
} from "@/db/schema";
import { seedDefaultPolicyIfEmpty } from "@/lib/scoping";
import { seedDefaultCapabilitiesIfEmpty } from "@/lib/capabilities";
import { eq } from "drizzle-orm";

async function upsertUser(input: { name: string; email: string; role: "admin" | "exec" | "finance" | "ops" | "viewer" }) {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values(input).returning();
  return created;
}

async function ensurePrefs(userId: string, dailyInterruptBudget = 6) {
  const [existing] = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);
  if (existing) return;
  await db.insert(notificationPrefs).values({
    userId,
    perClass: {
      alert: { inApp: true, email: false, webhook: false, optInInterrupt: true },
      action: { inApp: true, email: false, webhook: false, optInInterrupt: true },
      info: { inApp: true, email: false, webhook: false, optInInterrupt: false },
      digest: { inApp: true, email: false, webhook: false, optInInterrupt: false },
    },
    quietHoursStart: 22,
    quietHoursEnd: 7,
    dailyInterruptBudget,
  });
}

async function main() {
  await seedDefaultPolicyIfEmpty();
  await seedDefaultCapabilitiesIfEmpty();

  const admin = await upsertUser({ name: "Avery Admin", email: "avery@leados.dev", role: "admin" });
  const exec = await upsertUser({ name: "Priya Exec", email: "priya@leados.dev", role: "exec" });
  const finance = await upsertUser({ name: "Finn Finance", email: "finn@leados.dev", role: "finance" });
  const ops = await upsertUser({ name: "Orin Ops", email: "orin@leados.dev", role: "ops" });

  for (const u of [admin, exec, finance, ops]) {
    await ensurePrefs(u.id, u.role === "finance" ? 4 : 6);
  }

  const existingFindings = await db.select().from(findings).limit(1);
  if (existingFindings.length === 0) {
    await db.insert(findings).values([
      {
        title: "Unreconciled vendor payment spike ($42k, 3 vendors)",
        domain: "finance",
        severity: 5,
        urgencyHours: 4,
        status: "open",
        entityRef: "/findings/vendor-payment-spike",
        evidence: "3 payments > 2x trailing 90d median routed to new bank accounts within 48h.",
      },
      {
        title: "Ops SLA breach risk: queue depth 3.2x baseline",
        domain: "ops",
        severity: 4,
        urgencyHours: 12,
        status: "open",
        entityRef: "/findings/ops-queue-depth",
        evidence: "Ticket backlog grew from 40 to 128 over 6 hours; no staffing change logged.",
      },
      {
        title: "Minor: dashboard export formatting regression",
        domain: "general",
        severity: 1,
        urgencyHours: 168,
        status: "open",
        entityRef: "/findings/export-formatting",
        evidence: "CSV export column order changed after last deploy.",
      },
    ]);
  }

  const existingApprovals = await db.select().from(approvals).limit(1);
  if (existingApprovals.length === 0) {
    await db.insert(approvals).values([
      {
        title: "Approve vendor payment freeze for flagged accounts",
        domain: "finance",
        severity: 5,
        status: "pending",
        requestedForRole: "finance",
        entityRef: "/approvals/vendor-freeze",
      },
      {
        title: "Approve temporary ops staffing reallocation",
        domain: "ops",
        severity: 3,
        status: "pending",
        requestedForRole: "ops",
        entityRef: "/approvals/ops-reallocation",
      },
    ]);
  }

  const existingQueue = await db.select().from(workQueueItems).limit(1);
  if (existingQueue.length === 0) {
    await db.insert(workQueueItems).values([
      {
        title: "Verify new vendor bank account changes",
        domain: "finance",
        assigneeRole: "finance",
        status: "open",
        priority: 1,
        entityRef: "/work-queue/verify-vendor-accounts",
      },
      {
        title: "Re-balance ops ticket routing rules",
        domain: "ops",
        assigneeRole: "ops",
        status: "open",
        priority: 2,
        entityRef: "/work-queue/rebalance-routing",
      },
    ]);
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete:", {
    admin: admin.id,
    exec: exec.id,
    finance: finance.id,
    ops: ops.id,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
