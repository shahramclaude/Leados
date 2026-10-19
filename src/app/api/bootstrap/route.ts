import { getAgentStatus, getSnapshot } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const orchestratorResult = await getSnapshot();
  const agentStatus = getAgentStatus();
  return Response.json({ orchestratorResult, agentStatus });
}
