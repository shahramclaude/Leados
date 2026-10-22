import { sql } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, contacts, deals, leads, webhookDeliveries, webhookSubscriptions } from "@/db/schema";

export async function computeStats() {
  const [[leadCount], [contactCount], [dealCount], [openValue], runCounts, [subCount], [pendingDeliveries], [deadLetters]] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(leads).where(sql`${leads.deletedAt} is null`),
      db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(sql`${contacts.deletedAt} is null`),
      db.select({ count: sql<number>`count(*)::int` }).from(deals).where(sql`${deals.deletedAt} is null`),
      db
        .select({ total: sql<string>`coalesce(sum(${deals.value}), 0)::text` })
        .from(deals)
        .where(sql`${deals.stage} = 'open' and ${deals.deletedAt} is null`),
      db
        .select({ status: automationRuns.status, count: sql<number>`count(*)::int` })
        .from(automationRuns)
        .groupBy(automationRuns.status),
      db.select({ count: sql<number>`count(*)::int` }).from(webhookSubscriptions),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookDeliveries)
        .where(sql`${webhookDeliveries.status} in ('pending', 'retrying')`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookDeliveries)
        .where(sql`${webhookDeliveries.status} = 'dead_letter'`),
    ]);

  const byStatus: Record<string, number> = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const row of runCounts) byStatus[row.status] = row.count;

  return {
    leads: leadCount?.count ?? 0,
    contacts: contactCount?.count ?? 0,
    deals: dealCount?.count ?? 0,
    openDealsValue: openValue?.total ?? "0",
    automationRuns: {
      queued: byStatus.queued ?? 0,
      running: byStatus.running ?? 0,
      succeeded: byStatus.succeeded ?? 0,
      failed: byStatus.failed ?? 0,
    },
    webhooks: {
      subscriptions: subCount?.count ?? 0,
      pendingDeliveries: pendingDeliveries?.count ?? 0,
      deadLetters: deadLetters?.count ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
