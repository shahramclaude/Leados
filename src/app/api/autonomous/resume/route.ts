import "@/lib/kernel/bootstrap";
import { runCycle } from "@/lib/kernel/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!body.runId) return Response.json({ error: "runId is required" }, { status: 400 });
  const result = await runCycle(body.runId, { actor: { kind: "human", id: "api:resume" } });
  return Response.json(result);
}
