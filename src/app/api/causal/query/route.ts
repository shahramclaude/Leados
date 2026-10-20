import { NextRequest } from "next/server";
import { DEMO_EVIDENCE, LEADOS_PEOPLE_SCM, generateDemoDataset } from "@/lib/causal/domainModel";
import { runCausalQuery } from "@/lib/causal/query";
import { placeboTest, negativeControlTest, buildFalsificationReport } from "@/lib/causal/validation";
import { renderClaimSentence } from "@/lib/causal/language";

export const dynamic = "force-dynamic";

const DATA = generateDemoDataset();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const effect = searchParams.get("effect") ?? "oneOnOneFrequency";
  const on = searchParams.get("on") ?? "retentionStays";
  return respond(effect, on);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const effect = body.effect ?? "oneOnOneFrequency";
  const on = body.on ?? "retentionStays";
  return respond(effect, on);
}

function respond(effect: string, on: string) {
  const variableIds = new Set(LEADOS_PEOPLE_SCM.variables.map((v) => v.id));
  if (!variableIds.has(effect) || !variableIds.has(on)) {
    return Response.json(
      { ok: false, error: `Unknown variable(s): effect="${effect}", on="${on}"` },
      { status: 400 }
    );
  }

  const estimate = runCausalQuery({
    scm: LEADOS_PEOPLE_SCM,
    query: { effect, on, population: "all active employees, trailing 12 months" },
    data: DATA,
    evidence: DEMO_EVIDENCE,
  });

  const effectLabel = LEADOS_PEOPLE_SCM.variables.find((v) => v.id === effect)?.label ?? effect;
  const onLabel = LEADOS_PEOPLE_SCM.variables.find((v) => v.id === on)?.label ?? on;
  const headline = renderClaimSentence(effectLabel, onLabel, estimate);

  let falsification = undefined;
  if (estimate.identifiable) {
    const placebo = placeboTest(DATA, effect, on, estimate.adjustmentSet, estimate.estimate?.ate ?? 0, {
      method: "regression",
    });
    const negativeControl = negativeControlTest(DATA, effect, "commuteDistanceKm", estimate.adjustmentSet);
    falsification = buildFalsificationReport(`${effect}->${on}`, placebo, negativeControl, true);
  }

  return Response.json({ ok: true, estimate, headline, falsification });
}
