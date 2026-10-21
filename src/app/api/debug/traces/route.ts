// Recent sampled trace spans — this is how a correlationId/traceId shown in
// an error envelope gets tied back to what actually happened server-side.
import { recentTraces } from "@/lib/obs/tracing";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "debug_traces" }, async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
  return Response.json({ spans: recentTraces(limit) });
});
