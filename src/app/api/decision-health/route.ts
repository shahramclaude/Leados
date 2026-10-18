import { getDecisionHealth } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await getDecisionHealth();
  return cachedJson(report);
}
