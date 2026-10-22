// Programmatic trigger for a chaos experiment — the integration point for
// Part 10's scheduler (not present in this repository snapshot) to call on
// the declared `schedule` (weekly/monthly/quarterly) for each experiment.
// Safety policy is enforced inside executeExperiment(): production runs are
// rejected unless the experiment's safetyPolicy.allowProduction is true.

import { executeExperiment, EXPERIMENTS } from "@/lib/resilience";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { key?: string; environment?: "test" | "staging" | "production" };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.key || !EXPERIMENTS.some((e) => e.key === body.key)) {
    return Response.json(
      { error: "unknown experiment key", knownKeys: EXPERIMENTS.map((e) => e.key) },
      { status: 400 },
    );
  }

  try {
    const { run, result } = await executeExperiment(body.key, { environment: body.environment ?? "test" });
    return Response.json({ runId: run.id, outcome: result.outcome, observed: result.observed, conclusion: result.conclusion });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
