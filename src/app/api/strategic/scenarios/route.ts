import { listScenarios, diffScenarios } from "@/lib/scenarioEngine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids");
  if (ids) {
    const scenarioIds = ids.split(",").map(Number).filter(Boolean);
    const diff = await diffScenarios(scenarioIds, Number(searchParams.get("months") ?? 12));
    return Response.json(diff);
  }
  const scenarios = await listScenarios();
  return Response.json({ scenarios });
}
