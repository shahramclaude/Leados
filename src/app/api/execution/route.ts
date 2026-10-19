import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { buildExecutionReport } from "@/lib/executionIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const report = buildExecutionReport(projection, new Date());
    return Response.json({ report });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
