import { listInterventions, createIntervention, getProgram } from "@/lib/change/repository";
import { assignSteppedWedge } from "@/lib/change/rollout";
import { explain } from "@/lib/explain";
import type { Intervention } from "@/lib/change/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const programId = url.searchParams.get("programId") ?? undefined;
  const interventions = await listInterventions(programId);
  return Response.json({ ok: true, interventions });
}

interface CreateInterventionBody {
  programId: string;
  kind: string;
  cost?: number;
  expectedEffectValue: number;
  expectedEffectBasis?: string;
  designIdentification?: "randomized_clean" | "randomized_contaminated" | "observational";
  periods?: number;
  startDate?: string;
}

/**
 * Intervention Lab — "design a rollout". Creates an intervention hypothesis
 * with a deterministic stepped-wedge assignment across the program's
 * affected groups (seeded from the intervention id, so re-fetching the same
 * intervention always reproduces the same design).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<CreateInterventionBody>;
  if (!body.programId || !body.kind || typeof body.expectedEffectValue !== "number") {
    return Response.json({ ok: false, error: "programId, kind, and expectedEffectValue are required" }, { status: 400 });
  }
  const program = await getProgram(body.programId);
  if (!program) {
    return Response.json({ ok: false, error: "program not found" }, { status: 404 });
  }
  if (program.affectedGroups.length < 2) {
    return Response.json({ ok: false, error: "stepped-wedge design requires at least 2 affected groups" }, { status: 400 });
  }

  const id = `interv-${body.programId}-${Date.now()}`;
  const periods = body.periods ?? 6;
  const rolloutDesign = assignSteppedWedge(program.affectedGroups, periods, `rollout:${id}`);

  const intervention: Intervention = {
    id,
    programId: body.programId,
    kind: body.kind,
    cost: body.cost ?? 0,
    expectedEffect: explain(body.expectedEffectValue, "planning_estimate_v1", { basis: body.expectedEffectBasis ?? "manual estimate" }, {
      confidence: "low",
      caveats: ["Expectation set by the program owner before rollout; not a measured baseline."],
    }),
    rolloutDesign,
    status: "proposed",
    startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
  };

  await createIntervention(intervention, body.designIdentification ?? "randomized_clean");

  return Response.json({ ok: true, intervention });
}
