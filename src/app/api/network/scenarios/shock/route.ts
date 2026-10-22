import { loadEcosystemGraph, nodeLabel } from "@/lib/network/graph";
import { runShockScenario, type ScenarioType } from "@/lib/network/scenarios";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { type?: ScenarioType; nodeId?: string; warGameRoleRef?: string }
    | null;

  if (!body?.type || !body?.nodeId) {
    return Response.json({ error: "type and nodeId are required" }, { status: 400 });
  }
  if (body.type !== "partner_loss" && body.type !== "key_person_loss") {
    return Response.json({ error: "type must be partner_loss or key_person_loss" }, { status: 400 });
  }

  const graph = await loadEcosystemGraph();
  if (!graph.nodes.some((n) => n.id === body.nodeId)) {
    return Response.json({ error: `unknown nodeId: ${body.nodeId}` }, { status: 404 });
  }

  const result = runShockScenario(graph, {
    type: body.type,
    nodeId: body.nodeId,
    warGameRoleRef: body.warGameRoleRef,
  });

  return Response.json({
    ...result,
    affected: result.affected.map((a) => ({ ...a, nodeName: nodeLabel(graph, a.nodeId) })),
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("nodeId");
  const type = (searchParams.get("type") ?? "partner_loss") as ScenarioType;
  if (!nodeId) {
    return Response.json({ error: "nodeId query param required" }, { status: 400 });
  }
  const graph = await loadEcosystemGraph();
  if (!graph.nodes.some((n) => n.id === nodeId)) {
    return Response.json({ error: `unknown nodeId: ${nodeId}` }, { status: 404 });
  }
  const result = runShockScenario(graph, { type, nodeId });
  return Response.json({
    ...result,
    affected: result.affected.map((a) => ({ ...a, nodeName: nodeLabel(graph, a.nodeId) })),
  });
}
