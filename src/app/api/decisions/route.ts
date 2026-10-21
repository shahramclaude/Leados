import { db } from "@/db";
import { decisions, decisionOptions, decisionCriteria, decisionOutcomes } from "@/db/schema";
import { listDecisions } from "@/lib/decisionEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listDecisions();
  return Response.json({ decisions: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { title, context, reversibility, ownerId, options, criteria } = body;
  if (!title || !context || !reversibility || !ownerId) {
    return Response.json({ error: "title, context, reversibility, ownerId are required" }, { status: 400 });
  }
  const [decision] = await db.insert(decisions).values({ title, context, reversibility, ownerId }).returning();

  const criteriaRows = criteria?.length
    ? await db.insert(decisionCriteria).values(criteria.map((c: { label: string; weight: number }) => ({ decisionId: decision.id, label: c.label, weight: String(c.weight) }))).returning()
    : [];

  if (options?.length) {
    for (const o of options as { label: string; description?: string; scores?: Record<string, number>; outcomes?: { scenarioLabel: string; probability: number; payoffLow: number; payoffBase: number; payoffHigh: number }[] }[]) {
      const [opt] = await db.insert(decisionOptions).values({ decisionId: decision.id, label: o.label, description: o.description ?? "", scores: o.scores ?? {} }).returning();
      if (o.outcomes?.length) {
        await db.insert(decisionOutcomes).values(
          o.outcomes.map((out) => ({
            optionId: opt.id,
            scenarioLabel: out.scenarioLabel,
            probability: String(out.probability),
            payoffLow: String(out.payoffLow),
            payoffBase: String(out.payoffBase),
            payoffHigh: String(out.payoffHigh),
          })),
        );
      }
    }
  }

  return Response.json({ decision, criteria: criteriaRows }, { status: 201 });
}
