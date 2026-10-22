import { getRisk, toSimulationInput } from "@/lib/risk";
import { simulateRisk } from "@/lib/montecarlo";
import { db } from "@/db";
import { riskSimulationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const risk = await getRisk(Number(id));
  if (!risk) return Response.json({ error: "not found" }, { status: 404 });

  let trials = 20000;
  try {
    const body = await req.json();
    if (body?.trials) trials = Math.min(Math.max(Number(body.trials), 1000), 100000);
  } catch {
    // no body supplied — use default trial count
  }

  const result = simulateRisk(toSimulationInput(risk), trials, `${risk.id}-${Date.now()}`);

  await db.insert(riskSimulationRuns).values({
    riskId: risk.id,
    trials: result.trials,
    seed: result.seed,
    inherentSummary: result.inherent as unknown as Record<string, unknown>,
    residualSummary: result.residual as unknown as Record<string, unknown>,
  });

  return Response.json({ result });
}
