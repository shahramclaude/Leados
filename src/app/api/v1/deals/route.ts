import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseFilters, parseLimit, parseSort } from "@/lib/api/pagination";
import { DealCreateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toDeal } from "@/lib/api/serialize";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";
import { emitEvent } from "@/lib/webhooks/worker";

export const dynamic = "force-dynamic";

const SORTABLE = ["createdAt", "updatedAt"] as const;
const SORT_COLUMN = { createdAt: deals.createdAt, updatedAt: deals.updatedAt } as const;

export const GET = withApi("deals:read", async (req, { correlationId, rl }) => {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { field, direction } = parseSort(sp.get("sort"), [...SORTABLE], "-createdAt");
    const filters = parseFilters(sp, { stage: ["eq"], leadId: ["eq"] }, ["cursor", "limit", "sort"]);

    const conditions = [sql`${deals.deletedAt} is null`];
    for (const f of filters) {
      if (f.field === "stage") conditions.push(eq(deals.stage, f.value));
      if (f.field === "leadId") conditions.push(eq(deals.leadId, f.value));
    }

    const sortColumn = SORT_COLUMN[field as keyof typeof SORT_COLUMN];
    if (sp.get("cursor")) conditions.push(cursorRowCondition(sortColumn, deals.id, decodeCursor(sp.get("cursor")!), direction));

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(deals.id)] : [asc(sortColumn), asc(deals.id)];
    const rows = await db.select().from(deals).where(and(...conditions)).orderBy(...orderFns).limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, field as keyof (typeof rows)[number]);
    return jsonOk({ data: items.map(toDeal), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const POST = withApi("deals:write", async (req, { correlationId, key, rl }) => {
  try {
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = DealCreateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Deal payload failed validation", parsed.error.flatten());

    const result = await handleIdempotentCreate(req, "POST /v1/deals", rawBody, async () => {
      const [row] = await db
        .insert(deals)
        .values({
          leadId: parsed.data.leadId,
          title: parsed.data.title,
          value: parsed.data.value !== undefined ? String(parsed.data.value) : "0",
          stage: parsed.data.stage ?? "open",
        })
        .returning();
      await recordAudit({ actor: key.id, action: "deal.created", resource: "deal", resourceId: row.id, correlationId });
      if (row.stage === "won") await emitEvent("deal.won", { id: row.id, title: row.title, value: row.value });
      return { status: 201, body: toDeal(row) };
    });
    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
