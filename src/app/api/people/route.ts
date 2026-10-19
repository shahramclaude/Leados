import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { computeNineBox } from "@/lib/orgIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const placements = computeNineBox(projection.people);
    const avgFlightRisk = projection.people.length ? projection.people.reduce((a, p) => a + p.flightRisk, 0) / projection.people.length : 0;
    return Response.json({ people: projection.people, placements, avgFlightRisk });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
