import { runMonteCarloForecast, type ForecastInput } from "@/lib/monteCarlo";
import { getCachedForecast, setCachedForecast } from "@/lib/forecastCache";

export const dynamic = "force-dynamic";

const MAX_TRIALS = 20_000;
const MAX_PERIODS = 120;

function parseInput(body: Record<string, unknown>): ForecastInput | null {
  const currentValue = Number(body.currentValue);
  const meanGrowthRate = Number(body.meanGrowthRate);
  const growthVolatility = Number(body.growthVolatility);
  const periods = Math.min(MAX_PERIODS, Math.max(1, Math.floor(Number(body.periods) || 12)));
  const trials = Math.min(MAX_TRIALS, Math.max(100, Math.floor(Number(body.trials) || 2000)));
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : 42;
  if (![currentValue, meanGrowthRate, growthVolatility].every(Number.isFinite)) return null;
  return { currentValue, meanGrowthRate, growthVolatility, periods, trials, seed };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const input = parseInput((body ?? {}) as Record<string, unknown>);
  if (!input) {
    return Response.json({ error: "currentValue, meanGrowthRate and growthVolatility must be numbers" }, { status: 400 });
  }

  const cached = getCachedForecast(input);
  if (cached) {
    return Response.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const result = runMonteCarloForecast(input);
  setCachedForecast(input, result);
  return Response.json(result, { headers: { "X-Cache": "MISS" } });
}
