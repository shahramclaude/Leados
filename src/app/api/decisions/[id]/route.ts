import { NextRequest } from "next/server";
import { db } from "@/db";
import { leadosDecisionLog, leadosDecisions } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  autoPostMortem,
  detectDecisionBiases,
  generateCounterfactuals,
  scoreOptions,
} from "@/lib/decisionEngine";
import { runSimulation, type SimInput } from "@/lib/monteCarlo";
import type { DecisionData, DecisionOption, DecisionStatus } from "@/lib/decisionTypes";

export const dynamic = "force-dynamic";

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isFinite(id) ? id : null;
}

async function loadDecision(id: number) {
  const [row] = await db.select().from(leadosDecisions).where(eq(leadosDecisions.id, id));
  return row ?? null;
}

function projectedOutcomeSimulation(options: DecisionOption[]) {
  if (options.length === 0) return null;
  // Aggregate all options into one blended projection so the UI always has
  // a histogram to show, even before a decision has been made.
  const inputs: SimInput[] = options.flatMap((o, idx) => [
    { name: `impact_${idx}`, distribution: "triangular", min: Math.max(o.impact - 2, 0), mode: o.impact, max: Math.min(o.impact + 2, 10) },
    { name: `cost_${idx}`, distribution: "triangular", min: Math.max(o.cost - 1.5, 0), mode: o.cost, max: Math.min(o.cost + 1.5, 10) },
    { name: `risk_${idx}`, distribution: "normal", mean: o.risk, stdDev: Math.max(o.risk * 0.25, 0.5) },
  ]);
  const n = inputs.length;
  const identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const weight = 1 / options.length;
  return runSimulation(inputs, identity, 4000, (vals) => {
    let total = 0;
    options.forEach((_, idx) => {
      total += weight * ((vals[`impact_${idx}`] ?? 0) * 10 - (vals[`cost_${idx}`] ?? 0) * 6 - (vals[`risk_${idx}`] ?? 0) * 7);
    });
    return total;
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const decision = await loadDecision(id);
  if (!decision) return Response.json({ error: "not found" }, { status: 404 });

  const logs = await db
    .select()
    .from(leadosDecisionLog)
    .where(eq(leadosDecisionLog.decisionId, id))
    .orderBy(asc(leadosDecisionLog.createdAt));

  const options = (decision.options as DecisionOption[] | null) ?? [];
  const scoredOptions = scoreOptions(decision);
  const biasFlags = detectDecisionBiases(decision);
  const counterfactuals = generateCounterfactuals(decision);
  const postMortem = decision.actualOutcome
    ? autoPostMortem(decision, (decision.data as DecisionData | null)?.outcomeMetrics ?? [])
    : null;
  const simulation = projectedOutcomeSimulation(options);

  return Response.json({
    decision,
    logs,
    scoredOptions,
    biasFlags,
    counterfactuals,
    postMortem,
    simulation,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const before = await loadDecision(id);
  if (!before) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const action: string = body.action ?? "update";
  const actor: string = body.actor ?? "system";

  let update: Partial<typeof leadosDecisions.$inferInsert> = {};

  switch (action) {
    case "decide": {
      if (!body.chosenOptionId) return Response.json({ error: "chosenOptionId is required" }, { status: 400 });
      update = {
        status: "decided" satisfies DecisionStatus,
        chosenOptionId: body.chosenOptionId,
        rationale: body.rationale ?? before.rationale,
        confidenceAtDecision: body.confidenceAtDecision != null ? Number(body.confidenceAtDecision) : before.confidenceAtDecision,
        expectedOutcome: body.expectedOutcome ?? before.expectedOutcome,
        decidedAt: new Date(),
      };
      break;
    }
    case "reverse": {
      update = {
        status: "reversed" satisfies DecisionStatus,
        rationale: body.rationale ?? before.rationale,
        decidedAt: before.decidedAt ?? new Date(),
      };
      break;
    }
    case "archive": {
      update = { status: "archived" satisfies DecisionStatus };
      break;
    }
    case "reopen": {
      update = { status: "open" satisfies DecisionStatus, decidedAt: null };
      break;
    }
    case "record_outcome": {
      update = {
        actualOutcome: body.actualOutcome ?? before.actualOutcome,
        outcomeScore: body.outcomeScore != null ? Number(body.outcomeScore) : before.outcomeScore,
        data: {
          ...(before.data as DecisionData),
          outcomeMetrics: Array.isArray(body.outcomeMetrics) ? body.outcomeMetrics : (before.data as DecisionData)?.outcomeMetrics,
        } satisfies DecisionData,
      };
      break;
    }
    case "update":
    default: {
      const allowed: (keyof typeof leadosDecisions.$inferInsert)[] = [
        "title",
        "description",
        "domain",
        "options",
        "rationale",
        "confidenceAtDecision",
        "expectedOutcome",
        "ownerId",
        "stakeholders",
        "deadline",
        "data",
      ];
      for (const key of allowed) {
        if (key in body) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (update as any)[key] = body[key];
        }
      }
      break;
    }
  }

  const [after] = await db.update(leadosDecisions).set(update).where(eq(leadosDecisions.id, id)).returning();

  await db.insert(leadosDecisionLog).values({
    decisionId: id,
    action,
    actor,
    before,
    after,
  });

  return Response.json({ decision: after });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const before = await loadDecision(id);
  if (!before) return Response.json({ error: "not found" }, { status: 404 });

  await db.delete(leadosDecisions).where(eq(leadosDecisions.id, id));

  return Response.json({ ok: true });
}


