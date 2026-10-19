import { runOrchestrator } from "@/lib/orchestrator";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await runOrchestrator();
  return cachedJson(report);
}
