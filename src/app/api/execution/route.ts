import { generateExecutionIntelligenceReport, loadExecutionDomain } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // The ExecutionIntelligenceReport is the computed core payload. The view
    // additionally needs lightweight raw context (owners, milestones,
    // blockers, dependency edges) to render the DAG, table, and detail
    // panel, so we bundle both under one response.
    const [report, domain] = await Promise.all([
      generateExecutionIntelligenceReport(),
      loadExecutionDomain(),
    ]);
    return Response.json({
      report,
      projects: domain.projects,
      milestones: domain.milestones,
      blockers: domain.blockers,
      crossDependencies: domain.crossDeps,
      people: domain.people,
    });
  } catch (err) {
    console.error("GET /api/execution failed", err);
    return Response.json(
      { error: "Failed to generate execution intelligence report" },
      { status: 500 },
    );
  }
}
