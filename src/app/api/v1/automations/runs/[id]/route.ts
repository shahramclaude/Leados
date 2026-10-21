import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk } from "@/lib/api/respond";
import { serializeAutomationRun } from "@/lib/api/serializers";

// Poll endpoint for the automation job interface.
export const GET = withApiRoute("automations:read", async (_req, ctx, params) => {
  const [run] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.id, params.id), eq(automationRuns.orgId, ctx.auth.orgId)))
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", `Automation run ${params.id} not found.`);
  return jsonOk(serializeAutomationRun(run), ctx.correlationId, { rateLimit: ctx.rateLimit });
});
