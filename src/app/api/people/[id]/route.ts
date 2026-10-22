import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { personUpdateSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

type Params = { id: string };

// Every lookup below filters by `orgId = session.orgId` in the same WHERE
// clause as the id lookup, so a request for a real id belonging to another
// org returns 404 — not 403, which would confirm the id exists in someone
// else's tenant (horizontal-escalation / enumeration defense).
async function findOwn(id: string, orgId: string) {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.orgId, orgId), isNull(people.deletedAt)));
  return row;
}

export const GET = secureRoute<Params>({
  method: "GET",
  path: "/api/people/:id",
  handler: async ({ session, params, request }) => {
    const s = session as SessionUser;
    const row = await findOwn(params.id, s.orgId);
    if (!row) return jsonError(404, "NOT_FOUND", "Person not found");

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.read",
      resourceType: "people",
      resourceId: row.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    }).catch(() => {});

    return NextResponse.json({ person: row });
  },
});

export const PATCH = secureRoute<Params>({
  method: "PATCH",
  path: "/api/people/:id",
  handler: async ({ session, params, request }) => {
    const s = session as SessionUser;
    const existing = await findOwn(params.id, s.orgId);
    if (!existing) return jsonError(404, "NOT_FOUND", "Person not found");

    const parsed = await readJson(request, personUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const [updated] = await db
      .update(people)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(people.id, params.id), eq(people.orgId, s.orgId)))
      .returning();

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.update",
      resourceType: "people",
      resourceId: updated.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ person: updated });
  },
});

export const DELETE = secureRoute<Params>({
  method: "DELETE",
  path: "/api/people/:id",
  handler: async ({ session, params, request }) => {
    const s = session as SessionUser;
    const existing = await findOwn(params.id, s.orgId);
    if (!existing) return jsonError(404, "NOT_FOUND", "Person not found");

    await db
      .update(people)
      .set({ deletedAt: new Date() })
      .where(and(eq(people.id, params.id), eq(people.orgId, s.orgId)));

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.delete",
      resourceType: "people",
      resourceId: params.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });

    return NextResponse.json({ ok: true });
  },
});
