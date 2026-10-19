import { listEvents } from "@/lib/eventStore";
import { runHealthSuite } from "@/lib/health";

export const dynamic = "force-dynamic";

// NOTE: distinct from /api/health (platform liveness probe). This route
// runs the 30-test self-diagnostic suite (T01-T30) for the HealthView.
export async function GET() {
  try {
    const events = await listEvents();
    const report = runHealthSuite(events, new Date());
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
