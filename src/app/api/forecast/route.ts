import { getForecast } from "@/lib/forecastCache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const horizon = Math.min(90, Math.max(1, Number(url.searchParams.get("horizon")) || 30));

  const started = performance.now();
  const { payload, cache } = await getForecast(horizon);
  const tookMs = performance.now() - started;

  return Response.json({ forecast: payload, cache, tookMs: Math.round(tookMs * 100) / 100 });
}
