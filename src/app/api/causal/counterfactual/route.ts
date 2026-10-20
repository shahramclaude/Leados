import { NextRequest } from "next/server";
import { DEMO_EVIDENCE, LEADOS_PEOPLE_SCM, generateDemoDataset } from "@/lib/causal/domainModel";
import { whyIsThisHappening, whatIf, whatWouldMoveThis, type InterventionCandidate } from "@/lib/causal/counterfactual";
import { runCausalQuery } from "@/lib/causal/query";
import type { Assignment } from "@/lib/causal/scm";

export const dynamic = "force-dynamic";

const DATA = generateDemoDataset();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const focus: string = body.focus ?? "engagementScore";
  const entity: Assignment = body.entity ?? DATA[0];
  const interventions: Assignment = body.interventions ?? { oneOnOneFrequency: (entity.oneOnOneFrequency ?? 2) + 1 };

  const why = whyIsThisHappening(LEADOS_PEOPLE_SCM, entity, focus, DEMO_EVIDENCE);
  const ifResult = whatIf(LEADOS_PEOPLE_SCM, entity, interventions, body.outcome ?? "retentionStays", DEMO_EVIDENCE);

  const candidateVars = ["oneOnOneFrequency", "roleClarity", "compensationCompetitiveness"];
  const costPerUnit: Record<string, number> = {
    oneOnOneFrequency: 25, // manager-hours cost proxy per extra session/month
    roleClarity: 10,
    compensationCompetitiveness: 500,
  };
  const candidates: InterventionCandidate[] = candidateVars.map((v) => ({
    variable: v,
    label: LEADOS_PEOPLE_SCM.variables.find((x) => x.id === v)?.label ?? v,
    estimate: runCausalQuery({
      scm: LEADOS_PEOPLE_SCM,
      query: { effect: v, on: body.outcome ?? "retentionStays", population: "all active employees" },
      data: DATA,
      evidence: DEMO_EVIDENCE,
    }),
    costPerUnit: costPerUnit[v] ?? 1,
    candidateDelta: 1,
  }));
  const moveThis = whatWouldMoveThis(candidates, DEMO_EVIDENCE);

  return Response.json({ ok: true, why, whatIf: ifResult, whatWouldMoveThis: moveThis });
}
