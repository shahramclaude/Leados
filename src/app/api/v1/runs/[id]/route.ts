import { withApiV1 } from "@/lib/platform/handler";
import { getRun } from "@/lib/platform/jobs";
import { toRunDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiV1<RouteCtx>("automation", async (_req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  const run = await getRun(ctx.orgId, id);
  return Response.json(toRunDTO(run));
});
