import { runAutomation } from "@/lib/app/automation";
import { ValidationError } from "@/lib/app/findings";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { kind, base, volatility, trials, seed } = (body ?? {}) as Record<string, unknown>;
  try {
    const run = await runAutomation({
      kind: (kind as "monte_carlo_forecast") ?? "monte_carlo_forecast",
      base: Number(base),
      volatility: Number(volatility),
      trials: Number(trials),
      seed: Number(seed),
    });
    return Response.json(run, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
