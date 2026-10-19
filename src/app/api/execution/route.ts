import { loadExecutionInputs } from "@/lib/orchestrator";
import { runExecutionIntelligence } from "@/lib/executionIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const inputs = await loadExecutionInputs();
    const report = runExecutionIntelligence(
      inputs.projects,
      inputs.milestones,
      inputs.blockers,
      inputs.crossDependencies,
      inputs.people,
      inputs.events,
      new Date(),
    );

    // The report is returned alongside the raw entities so the Execution
    // view can render the Kanban board / detail panels without a second
    // round trip. These extra keys do not collide with the
    // ExecutionIntelligenceReport shape.
    return Response.json({
      ...report,
      projects: inputs.projects,
      milestones: inputs.milestones,
      blockers: inputs.blockers,
      crossDependencies: inputs.crossDependencies,
      people: inputs.people,
    });
  } catch (error) {
    console.error("GET /api/execution failed", error);
    return Response.json({ error: "Failed to compute execution intelligence" }, { status: 500 });
  }
}
