import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import {
  buildPageMeta,
  cursorRowCondition,
  decodeCursor,
  parseFilters,
  parseLimit,
  parseSort,
} from "@/lib/api/pagination";
import { LeadCreateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toLead } from "@/lib/api/serialize";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";
import { emitEvent } from "@/lib/webhooks/worker";

export const dynamic = "force-dynamic";

const SORTABLE = ["createdAt", "updatedAt", "score"] as const;
const SORT_COLUMN = { createdAt: leads.createdAt, updatedAt: leads.updatedAt, score: leads.score } as const;

export const GET = withApi("leads:read", async (req, { correlationId, rl }) => {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { field, direction } = parseSort(sp.get("sort"), [...SORTABLE], "-createdAt");
    const filters = parseFilters(sp, { status: ["eq"], score: ["gte", "lte"], ownerId: ["eq"] }, [
      "cursor",
      "limit",
      "sort",
    ]);

    const conditions = [sql`${leads.deletedAt} is null`];
    for (const f of filters) {
      if (f.field === "status") conditions.push(eq(leads.status, f.value));
      if (f.field === "ownerId") conditions.push(eq(leads.ownerId, f.value));
      if (f.field === "score" && f.op === "gte") conditions.push(gte(leads.score, Number(f.value)));
      if (f.field === "score" && f.op === "lte") conditions.push(lte(leads.score, Number(f.value)));
    }

    const sortColumn = SORT_COLUMN[field as keyof typeof SORT_COLUMN];
    if (sp.get("cursor")) {
      const cursor = decodeCursor(sp.get("cursor")!);
      conditions.push(cursorRowCondition(sortColumn, leads.id, cursor, direction));
    }

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(leads.id)] : [asc(sortColumn), asc(leads.id)];

    const rows = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(...orderFns)
      .limit(limit + 1);

    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, field as keyof (typeof rows)[number]);
    return jsonOk({ data: items.map(toLead), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const POST = withApi("leads:write", async (req, { correlationId, key, rl }) => {
  try {
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = LeadCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Lead payload failed validation", parsed.error.flatten());
    }

    const result = await handleIdempotentCreate(req, "POST /v1/leads", rawBody, async () => {
      const [row] = await db
        .insert(leads)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          company: parsed.data.company,
          status: parsed.data.status ?? "new",
          score: parsed.data.score ?? 0,
          ownerId: parsed.data.ownerId,
        })
        .returning();
      await recordAudit({
        actor: key.id,
        action: "lead.created",
        resource: "lead",
        resourceId: row.id,
        correlationId,
      });
      await emitEvent("lead.created", { id: row.id, name: row.name, email: row.email, status: row.status });
      return { status: 201, body: toLead(row) };
    });

    return jsonOk(
      result.body,
      correlationId,
      { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} },
      rl,
    );
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
