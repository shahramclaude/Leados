import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { findRunByIdempotencyKey, getPlaybook, runPlaybook } from "@/lib/api/automation";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { TriggerRunSchema } from "@/lib/api/schemas";
import { serializeAutomationRun } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

// One job interface: triggering lives here; polling/streaming live under
// /api/v1/automations/runs/{id} and the realtime stream — the same
// `runPlaybook()` call path backs every trigger, whether invoked by a human
// via the dashboard or a third party via this API.
export const POST = withApiRoute("automations:write", async (req, ctx, params) => {
  const playbook = getPlaybook(params.key);
  if (!playbook) throw new ApiError("NOT_FOUND", `Playbook "${params.key}" not found.`);

  const raw = await req.json().catch(() => ({}));
  const parsed = TriggerRunSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await findRunByIdempotencyKey(ctx.auth.orgId, params.key, idempotencyKey);
    if (existing) {
      return jsonOk(serializeAutomationRun(existing), ctx.correlationId, {
        status: 200,
        rateLimit: ctx.rateLimit,
        headers: { "Idempotent-Replayed": "true" },
      });
    }
  }

  const run = await runPlaybook(ctx.auth.orgId, params.key, parsed.data.input, ctx.correlationId, idempotencyKey);
  return jsonOk(serializeAutomationRun(run!), ctx.correlationId, { status: 201, rateLimit: ctx.rateLimit });
});

export const GET = withApiRoute("automations:read", async (req, ctx, params) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(automationRuns.orgId, ctx.auth.orgId), eq(automationRuns.playbookKey, params.key)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(automationRuns.createdAt, new Date(cursor.v)),
        and(eq(automationRuns.createdAt, new Date(cursor.v)), op(automationRuns.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(automationRuns)
    .where(and(...conditions))
    .orderBy(dir(automationRuns.createdAt), dir(automationRuns.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeAutomationRun);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
