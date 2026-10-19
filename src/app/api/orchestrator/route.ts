import { fetchOrchestrationDataset } from "@/lib/dataset.server";
import { runFullOrchestration } from "@/lib/orchestrator";
import { jsonError, logDuration } from "@/lib/apiUtils";

export const dynamic = "force-dynamic";

const ROUTE = "api/orchestrator";

export async function GET() {
  const start = Date.now();
  try {
    const dataset = await fetchOrchestrationDataset();
    const result = runFullOrchestration(dataset);
    logDuration(ROUTE, start);
    return Response.json(result);
  } catch (err) {
    console.error(`[${ROUTE}] error`, err);
    logDuration(ROUTE, start);
    return jsonError(503, "DB_UNAVAILABLE", "Failed to load orchestrator data.");
  }
}
