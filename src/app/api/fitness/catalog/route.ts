import { DIMENSIONS, METRICS } from "@/lib/fitness/dimensions";

export const dynamic = "force-dynamic";

/** GET /api/fitness/catalog — the declared, policy-reviewed shape of the fitness function itself. */
export async function GET() {
  return Response.json({ ok: true, dimensions: DIMENSIONS, metrics: METRICS });
}
