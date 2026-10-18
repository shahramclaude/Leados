import { getOrgNetworkReport } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await getOrgNetworkReport();
  return cachedJson(report);
}
