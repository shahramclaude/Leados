import { runOrchestratorCycle } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const orchestratorResult = await runOrchestratorCycle();
  return Response.json({ orchestratorResult });
}
