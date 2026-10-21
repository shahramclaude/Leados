import { getDecisionDetail, criteriaScore, expectedValueDistribution, preMortemPrompts } from "@/lib/decisionEngine";
import { num } from "@/lib/format";
import type { Reversibility } from "@/lib/decisionTypes";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDecisionDetail(Number(id));
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });

  const options = detail.options.map((o) => {
    const outcomes = detail.outcomesByOption.get(o.id) ?? [];
    const ev = outcomes.length
      ? expectedValueDistribution(outcomes.map((x) => ({ scenarioLabel: x.scenarioLabel, probability: num(x.probability), payoffLow: num(x.payoffLow), payoffBase: num(x.payoffBase), payoffHigh: num(x.payoffHigh) })))
      : null;
    return {
      ...o,
      scores: o.scores as Record<string, number>,
      weightedCriteriaScore: criteriaScore(o.scores as Record<string, number>, detail.criteria.map((c) => ({ id: c.id, weight: num(c.weight) }))),
      ev,
      outcomes,
    };
  });

  return Response.json({
    decision: detail.decision,
    criteria: detail.criteria,
    options,
    retrospective: detail.retro,
    preMortemPrompts: preMortemPrompts(detail.decision.reversibility as Reversibility),
  });
}
