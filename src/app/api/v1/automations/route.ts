import { withApiRoute } from "@/lib/api/handler";
import { jsonOk } from "@/lib/api/respond";
import { listPlaybooks } from "@/lib/api/automation";

export const GET = withApiRoute("automations:read", async (_req, ctx) => {
  const data = listPlaybooks().map((p) => ({
    key: p.key,
    description: p.description,
    steps: p.steps.map((s) => s.type),
    inputSchemaDescription: p.inputSchemaDescription,
  }));
  return jsonOk({ data }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
