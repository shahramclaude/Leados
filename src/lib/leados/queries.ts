import { db } from "@/db";
import {
  activityLog,
  decisions,
  financialLines,
  hypotheses,
  knowledgeItems,
  metrics,
  people,
  playbooks,
  signals,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function getCockpitData() {
  const [pendingDecisions, recentActivity, topSignals, keyMetrics] = await Promise.all([
    db.select().from(decisions).where(eq(decisions.status, "pending")).orderBy(desc(decisions.severity)),
    db.select().from(activityLog).orderBy(desc(activityLog.occurredAt)).limit(8),
    db.select().from(signals).orderBy(desc(signals.severity)).limit(6),
    db.select().from(metrics).orderBy(desc(metrics.updatedAt)).limit(4),
  ]);
  return { pendingDecisions, recentActivity, topSignals, keyMetrics };
}

export async function getPeople() {
  return db.select().from(people).orderBy(people.name);
}

export async function getMetrics() {
  return db.select().from(metrics).orderBy(metrics.category, metrics.name);
}

export async function getSignals() {
  return db.select().from(signals).orderBy(desc(signals.severity), desc(signals.detectedAt));
}

export async function getKnowledge() {
  return db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.confidence));
}

export async function getHypotheses() {
  return db.select().from(hypotheses).orderBy(desc(hypotheses.confidence));
}

export async function getDecisions(track?: "execution" | "strategic") {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.severity), decisions.dueDate);
  return track ? rows.filter((row) => row.track === track) : rows;
}

export async function getFinancialLines() {
  return db.select().from(financialLines).orderBy(financialLines.category, financialLines.name);
}

export async function getPlaybooks() {
  return db.select().from(playbooks).orderBy(playbooks.name);
}
