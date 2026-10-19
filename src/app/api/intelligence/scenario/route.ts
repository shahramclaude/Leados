import { createScenario, listScenarios } from "@/lib/intelligence/intelligence";
import type { ScenarioRequest } from "@/lib/intelligence/scenarioEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listScenarios();
  return Response.json({ scenarios: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScenarioRequest;
  if (!body?.name || !Array.isArray(body.interventions)) {
    return Response.json({ error: "name and interventions[] are required" }, { status: 400 });
  }
  const result = await createScenario(body);
  return Response.json({ result });
}
