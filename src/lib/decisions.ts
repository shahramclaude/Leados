// src/lib/decisions.ts — small Beta-Bernoulli decision tracker (bounded list, no pagination
// needed yet at expected volume, but capped at MAX_ROWS defensively so it can never become
// an unbounded query if decision volume grows).
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { decisions } from "@/db/schema";

const MAX_ROWS = 500;

export interface DecisionRecord {
  id: number;
  title: string;
  context: string;
  priorAlpha: number;
  priorBeta: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  status: string;
  createdAt: string;
}

function toRecord(row: typeof decisions.$inferSelect): DecisionRecord {
  return {
    id: row.id,
    title: row.title,
    context: row.context,
    priorAlpha: Number(row.priorAlpha),
    priorBeta: Number(row.priorBeta),
    posteriorAlpha: Number(row.posteriorAlpha),
    posteriorBeta: Number(row.posteriorBeta),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDecisions(): Promise<DecisionRecord[]> {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(MAX_ROWS);
  return rows.map(toRecord);
}

export async function countOpenDecisions(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*) filter (where status = 'open')::int` })
    .from(decisions);
  return row?.count ?? 0;
}

export class ValidationError extends Error {}

export async function createDecision(input: { title: string; context?: string }): Promise<DecisionRecord> {
  if (!input.title.trim()) throw new ValidationError("title is required");
  const [row] = await db
    .insert(decisions)
    .values({ title: input.title, context: input.context ?? "" })
    .returning();
  return toRecord(row);
}
