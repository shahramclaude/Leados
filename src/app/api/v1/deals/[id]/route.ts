import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { computeEtag, matchesIfNoneMatch } from "@/lib/api/etag";
import { DealUpdateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toDeal } from "@/lib/api/serialize";
import { recordAudit } from "@/lib/api/audit";
import { emitEvent } from "@/lib/webhooks/worker";

export const dynamic = "force-dynamic";

async function findActive(id: string) {
  const [row] = await db.select().from(deals).where(and(eq(deals.id, id), isNull(deals.deletedAt))).limit(1);
  if (!row) throw new ApiError("NOT_FOUND", `No deal with id ${id}`);
  return row;
}

export const GET = withApi("deals:read", async (req, { correlationId, rl, params }) => {
  try {
    const row = await findActive(params.id);
    const etag = computeEtag(row.id, row.updatedAt);
    if (matchesIfNoneMatch(req, etag)) return new Response(null, { status: 304, headers: baseHeaders(correlationId, { ETag: etag }) });
    return jsonOk(toDeal(row), correlationId, { headers: { ETag: etag } }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const PATCH = withApi("deals:write", async (req, { correlationId, key, rl, params }) => {
  try {
    const before = await findActive(params.id);
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = DealUpdateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Deal payload failed validation", parsed.error.flatten());
    const [row] = await db
      .update(deals)
      .set({ ...parsed.data, value: parsed.data.value !== undefined ? String(parsed.data.value) : undefined, updatedAt: new Date() })
      .where(eq(deals.id, params.id))
      .returning();
    await recordAudit({ actor: key.id, action: "deal.updated", resource: "deal", resourceId: row.id, correlationId });
    if (before.stage !== "won" && row.stage === "won") {
      await emitEvent("deal.won", { id: row.id, title: row.title, value: row.value });
    }
    return jsonOk(toDeal(row), correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
