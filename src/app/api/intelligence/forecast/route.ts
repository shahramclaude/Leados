import { forecast } from "@/lib/intelligence/intelligence";
import { DEFAULT_FORECAST_INPUT } from "@/lib/intelligence/demoData";
import type { MonteCarloInput } from "@/lib/intelligence/monteCarlo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<MonteCarloInput>;
  const input: MonteCarloInput = {
    ...DEFAULT_FORECAST_INPUT,
    ...body,
    drivers: body.drivers ?? DEFAULT_FORECAST_INPUT.drivers,
  };
  const result = await forecast(input);
  return Response.json({ result });
}

export async function GET() {
  const result = await forecast(DEFAULT_FORECAST_INPUT);
  return Response.json({ result });
}
