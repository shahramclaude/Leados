import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseFilters, parseLimit, parseSort } from "@/lib/api/pagination";
import { ContactCreateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toContact } from "@/lib/api/serialize";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

const SORTABLE = ["createdAt", "updatedAt"] as const;
const SORT_COLUMN = { createdAt: contacts.createdAt, updatedAt: contacts.updatedAt } as const;

export const GET = withApi("contacts:read", async (req, { correlationId, rl }) => {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { field, direction } = parseSort(sp.get("sort"), [...SORTABLE], "-createdAt");
    const filters = parseFilters(sp, { leadId: ["eq"] }, ["cursor", "limit", "sort"]);

    const conditions = [sql`${contacts.deletedAt} is null`];
    for (const f of filters) if (f.field === "leadId") conditions.push(eq(contacts.leadId, f.value));

    const sortColumn = SORT_COLUMN[field as keyof typeof SORT_COLUMN];
    if (sp.get("cursor")) conditions.push(cursorRowCondition(sortColumn, contacts.id, decodeCursor(sp.get("cursor")!), direction));

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(contacts.id)] : [asc(sortColumn), asc(contacts.id)];
    const rows = await db.select().from(contacts).where(and(...conditions)).orderBy(...orderFns).limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, field as keyof (typeof rows)[number]);
    return jsonOk({ data: items.map(toContact), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const POST = withApi("contacts:write", async (req, { correlationId, key, rl }) => {
  try {
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = ContactCreateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Contact payload failed validation", parsed.error.flatten());

    const result = await handleIdempotentCreate(req, "POST /v1/contacts", rawBody, async () => {
      const [row] = await db
        .insert(contacts)
        .values({ leadId: parsed.data.leadId, name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone })
        .returning();
      await recordAudit({ actor: key.id, action: "contact.created", resource: "contact", resourceId: row.id, correlationId });
      return { status: 201, body: toContact(row) };
    });
    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
