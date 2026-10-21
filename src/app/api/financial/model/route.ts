import { baseForecast, runwayDistribution, runwayTornado, covenantHeadroom, fundraisingReadiness } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET() {
  const [forecast, runway, tornado, covenants, readiness] = await Promise.all([
    baseForecast(12),
    runwayDistribution(800, 36, 23),
    runwayTornado(),
    covenantHeadroom(),
    fundraisingReadiness(),
  ]);
  return Response.json({ forecast, runway, tornado, covenants, readiness });
}
