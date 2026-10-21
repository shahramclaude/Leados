import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { AUTOMATION_RUN_FILTER_WHITELIST, buildFilterConditions } from "@/lib/api/resourceFilters";
import { jsonOk } from "@/lib/api/respond";
import { serializeAutomationRun } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

// Lists automation runs across all playbooks for the org (filterable by
// `playbookKey[eq]` / `status[eq]`). Use /api/v1/automations/{key}/runs to
// scope to a single playbook via the path instead.
export const GET = withApiRoute("automations:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const filters = buildFilterConditions(url.searchParams, AUTOMATION_RUN_FILTER_WHITELIST, {
    status: automationRuns.status,
    playbookKey: automationRuns.playbookKey,
    createdAt: automationRuns.createdAt,
  });
  const conditions = [eq(automationRuns.orgId, ctx.auth.orgId), ...filters];
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
