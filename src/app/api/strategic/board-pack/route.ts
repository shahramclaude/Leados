import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { computeOKRHealth, runScenarioSurveillance, runWargameAutoAnalysis, generateBoardPack } from "@/lib/strategicIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const okr = computeOKRHealth(projection.goals, now);
    const scenarios = runScenarioSurveillance(projection);
    const wargame = runWargameAutoAnalysis(projection, now);
    const openDecisions = projection.decisions.filter((d) => !d.outcome).length;
    const pack = generateBoardPack(okr, scenarios, wargame, openDecisions, projection.boardNotes);
    return Response.json({ pack });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
