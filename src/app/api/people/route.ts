import { NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, parseQuery, readJson, secureRoute } from "@/lib/apiUtils";
import { peopleListQuerySchema, personCreateSchema } from "@/lib/validation/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

// GET: org-scoped list. `session.orgId` (server-verified) is the ONLY source
// of tenant scoping — never a client-supplied orgId/query param. This is
// what makes horizontal (cross-tenant) escalation impossible from this
// route: the WHERE clause always includes `eq(people.orgId, session.orgId)`.
export const GET = secureRoute({
  method: "GET",
  path: "/api/people",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsedQuery = parseQuery(new URL(request.url), peopleListQuerySchema);
    if (!parsedQuery.ok) return parsedQuery.response;
    const { q, limit, offset } = parsedQuery.data;

    const conditions = [eq(people.orgId, session.orgId), isNull(people.deletedAt)];
    if (q) {
      conditions.push(or(ilike(people.fullName, `%${q}%`), ilike(people.email, `%${q}%`))!);
    }

    const rows = await db
      .select()
      .from(people)
      .where(and(...conditions))
      .orderBy(desc(people.createdAt))
      .limit(limit)
      .offset(offset);

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.list",
      resourceType: "person",
      ip: await getClientIp(),
      metadata: { count: rows.length, q: q ?? null, limit, offset },
    });

    return NextResponse.json({ people: rows });
  },
});

export const POST = secureRoute({
  method: "POST",
  path: "/api/people",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsed = await readJson(request, personCreateSchema);
    if (!parsed.ok) return parsed.response;

    const [row] = await db
      .insert(people)
      .values({ ...parsed.data, orgId: session.orgId, createdByUserId: session.userId })
      .returning();

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.create",
      resourceType: "person",
      resourceId: row.id,
      ip: await getClientIp(),
    });

    return NextResponse.json({ person: row }, { status: 201 });
  },
});
