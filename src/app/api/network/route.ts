import { getNetworkGraph } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Rendering a force-directed layout for the *entire* entity graph does not
// scale (nor does it help a human read it), so this route always returns a
// capped, risk-ranked subgraph. The cap is enforced in SQL via LIMIT, not by
// fetching everything and slicing in JS.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const graph = await getNetworkGraph(limit);
  return Response.json(graph);
}
