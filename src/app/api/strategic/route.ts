import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { computeOKRHealth, runScenarioSurveillance, runWargameAutoAnalysis } from "@/lib/strategicIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const okr = computeOKRHealth(projection.goals, now);
    const scenarios = runScenarioSurveillance(projection);
    const wargame = runWargameAutoAnalysis(projection, now);
    const boardNotes = projection.boardNotes;
    const decisions = projection.decisions;
    return Response.json({ okr, scenarios, wargame, boardNotes, decisions });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
