import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { SYSTEM_BLIND_SPOTS } from "@/lib/assurance/blindSpots";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    perCheck: CHECK_REGISTRY.map((c) => ({
      checkId: c.id,
      name: c.name,
      domain: c.domain,
      relatedPart: c.relatedPart,
      blindSpots: c.blindSpots,
    })),
    systemLevel: SYSTEM_BLIND_SPOTS,
  });
}
