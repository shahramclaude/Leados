// Public, unauthenticated aggregate stats that power the status page
// (`/status`). Deliberately free of per-org/customer data.
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, findings, runs, webhookDeliveries, webhookSubscriptions } from "@/db/schema";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  try {
    const [[decisionsCount], [findingsCount], [runsCount], [subsCount], [delivered], [retrying], [deadLetter]] =
      await Promise.all([
        db.select({ value: count() }).from(decisions),
        db.select({ value: count() }).from(findings),
        db.select({ value: count() }).from(runs),
        db.select({ value: count() }).from(webhookSubscriptions).where(eq(webhookSubscriptions.active, true)),
        db.select({ value: count() }).from(webhookDeliveries).where(eq(webhookDeliveries.status, "delivered")),
        db.select({ value: count() }).from(webhookDeliveries).where(eq(webhookDeliveries.status, "retrying")),
        db.select({ value: count() }).from(webhookDeliveries).where(eq(webhookDeliveries.status, "dead_letter")),
      ]);

    return Response.json({
      status: "operational",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      apiVersion: "v1",
      counts: {
        decisions: decisionsCount.value,
        findings: findingsCount.value,
        runs: runsCount.value,
        webhookSubscriptions: subsCount.value,
      },
      webhookHealth: {
        delivered: delivered.value,
        retrying: retrying.value,
        deadLetter: deadLetter.value,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { status: "down", error: err instanceof Error ? err.message : "unknown error", generatedAt: new Date().toISOString() },
      { status: 503 },
    );
  }
}
