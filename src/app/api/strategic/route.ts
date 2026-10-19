import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisions as decisionsTable, events as eventsTable, metricValues as metricValuesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runStrategicIntelligence, runWargameForDecision } from "@/lib/strategicIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const [decisions, events, metrics] = await Promise.all([
    db.select().from(decisionsTable),
    db.select().from(eventsTable),
    db.select().from(metricValuesTable),
  ]);

  const report = await runStrategicIntelligence(decisions, events, metrics, now);
  return NextResponse.json(report);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, decisionId } = body as { action?: string; decisionId?: string };

  if (action !== "trigger_wargame") {
    return NextResponse.json({ error: "Unsupported action. Use { action: 'trigger_wargame', decisionId }." }, { status: 400 });
  }
  if (!decisionId) {
    return NextResponse.json({ error: "decisionId is required" }, { status: 400 });
  }

  const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, decisionId));
  if (!decision) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  const now = new Date();
  const alert = await runWargameForDecision(decisionId, decision, now);

  await db.insert(eventsTable).values({
    type: "strategy.wargame.manual_trigger",
    domain: alert.domain,
    severity: 4,
    payload: { decisionId, alert },
  });

  return NextResponse.json({ alert });
}
