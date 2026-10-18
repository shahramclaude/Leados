import { getGraphSubgraph } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const graph = await getGraphSubgraph();
  return cachedJson(graph);
}
