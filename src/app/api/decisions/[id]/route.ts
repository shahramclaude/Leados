import { db } from "@/db";
import { decisions, decisionCriteria, decisionOptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { rankOptions, doorGuidance, isRetrospectiveDue, scoreRetrospective } from "@/lib/decisionEngine";
import type { Decision, DecisionCriterion, DecisionOption } from "@/lib/decisionTypes";

export const dynamic = "force-dynamic";

async function loadDecision(decisionId: number) {
  const [row] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
  if (!row) return null;
  const criteriaRows = await db.select().from(decisionCriteria).where(eq(decisionCriteria.decisionId, decisionId));
  const optionRows = await db.select().from(decisionOptions).where(eq(decisionOptions.decisionId, decisionId));
  return { row, criteriaRows, optionRows };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId)) return jsonError("Invalid decision id");
  const loaded = await loadDecision(decisionId);
  if (!loaded) return jsonError("Decision not found", 404);
  const { row, criteriaRows, optionRows } = loaded;

  const decision: Decision = {
    id: row.id,
    title: row.title,
    domain: row.domain as Decision["domain"],
    status: row.status as Decision["status"],
    context: row.context,
    doorType: row.doorType as Decision["doorType"],
    impact: row.impact,
    deadline: row.deadline,
    preMortem: Array.isArray(row.preMortem) ? row.preMortem : [],
    chosenOptionId: row.chosenOptionId,
    retrospectiveScore: row.retrospectiveScore,
    retrospectiveNotes: row.retrospectiveNotes,
    retrospectiveDueAt: row.retrospectiveDueAt ? row.retrospectiveDueAt.toISOString() : null,
  };
  const criteria: DecisionCriterion[] = criteriaRows.map((c) => ({ id: c.id, name: c.name, weight: c.weight }));
  const options: DecisionOption[] = optionRows.map((o) => ({
    id: o.id,
    label: o.label,
    description: o.description,
    criteriaScores: (o.criteriaScores as Record<string, number>) ?? {},
    estimatedValue: o.estimatedValue,
    uncertaintyLow: o.uncertaintyLow,
    uncertaintyHigh: o.uncertaintyHigh,
    probabilityOfSuccess: o.probabilityOfSuccess,
  }));

  const ranked = rankOptions(decision, options, criteria);
  const guidance = doorGuidance(decision.doorType, decision.impact);
  const retrospectiveDue = isRetrospectiveDue(decision);

  return Response.json({ decision, criteria, ranked, guidance, retrospectiveDue });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId)) return jsonError("Invalid decision id");
  const body = await readJsonBody(request);

  if (body.action === "decide") {
    const chosenOptionId = parseNumber(body.chosenOptionId, 0);
    const retrospectiveDueAt = body.deadline ? new Date(body.deadline as string) : new Date(Date.now() + 30 * 86400000);
    const [updated] = await db
      .update(decisions)
      .set({ status: parseString(body.status, "approved"), chosenOptionId, retrospectiveDueAt, updatedAt: new Date() })
      .where(eq(decisions.id, decisionId))
      .returning();
    if (!updated) return jsonError("Decision not found", 404);
    return Response.json(updated);
  }

  if (body.action === "retrospective") {
    const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
    if (!existing) return jsonError("Decision not found", 404);
    if (!existing.chosenOptionId) return jsonError("Decision has no chosen option to score a retrospective against");
    const [option] = await db.select().from(decisionOptions).where(eq(decisionOptions.id, existing.chosenOptionId)).limit(1);
    if (!option) return jsonError("Chosen option not found", 404);

    const actualOutcomeValue = parseNumber(body.actualOutcomeValue, 0);
    const actualSucceeded = Boolean(body.actualSucceeded);
    const { score, notes } = scoreRetrospective(option, actualOutcomeValue, actualSucceeded);

    const [updated] = await db
      .update(decisions)
      .set({ retrospectiveScore: score, retrospectiveNotes: notes, updatedAt: new Date() })
      .where(eq(decisions.id, decisionId))
      .returning();
    return Response.json(updated);
  }

  if (body.action === "preMortem") {
    const preMortem = Array.isArray(body.preMortem) ? body.preMortem : [];
    const [updated] = await db.update(decisions).set({ preMortem, updatedAt: new Date() }).where(eq(decisions.id, decisionId)).returning();
    return Response.json(updated);
  }

  const update: Partial<typeof decisions.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.status === "string") update.status = body.status;
  if (typeof body.context === "string") update.context = body.context;
  const [updated] = await db.update(decisions).set(update).where(eq(decisions.id, decisionId)).returning();
  if (!updated) return jsonError("Decision not found", 404);
  return Response.json(updated);
}
