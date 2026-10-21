import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, automationRuns, events, leads, webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk } from "@/lib/api/respond";

// Powers the status surface described in docs/API.md. Deliberately
// read-only aggregate counts only — no row-level data — so it is safe to be
// broadly scoped (`events:read`) rather than admin-only. The
// `webhookDeadLetterCount` field is what Part 18's alerting polls: a
// non-zero value should raise a finding.
export const GET = withApiRoute("events:read", async (_req, ctx) => {
  const [[leadCount], [accountCount], [runCount], [subCount], [deadLetterCount], [recentEvents]] = await Promise.all([
    db.select({ n: count() }).from(leads).where(eq(leads.orgId, ctx.auth.orgId)),
    db.select({ n: count() }).from(accounts).where(eq(accounts.orgId, ctx.auth.orgId)),
    db.select({ n: count() }).from(automationRuns).where(eq(automationRuns.orgId, ctx.auth.orgId)),
    db.select({ n: count() }).from(webhookSubscriptions).where(eq(webhookSubscriptions.orgId, ctx.auth.orgId)),
    db
      .select({ n: count() })
      .from(webhookDeliveries)
      .innerJoin(webhookSubscriptions, eq(webhookDeliveries.subscriptionId, webhookSubscriptions.id))
      .where(and(eq(webhookSubscriptions.orgId, ctx.auth.orgId), eq(webhookDeliveries.status, "dead_letter"))),
    db
      .select({ n: count() })
      .from(events)
      .where(and(eq(events.orgId, ctx.auth.orgId), gte(events.createdAt, sql`now() - interval '24 hours'`))),
  ]);

  return jsonOk(
    {
      leads: leadCount.n,
      accounts: accountCount.n,
      automationRuns: runCount.n,
      webhookSubscriptions: subCount.n,
      webhookDeadLetterCount: deadLetterCount.n,
      eventsLast24h: recentEvents.n,
    },
    ctx.correlationId,
    { rateLimit: ctx.rateLimit },
  );
});
