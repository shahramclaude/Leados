import { getInterventionLibrary } from "@/lib/recommender/library";

export const dynamic = "force-dynamic";

/** GET /api/recommender/library — marketplace browse with measured-outcome badges. */
export async function GET() {
  const entries = await getInterventionLibrary();
  return Response.json({ entries });
}
