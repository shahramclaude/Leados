import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { personUpdateSchema } from "@/lib/validation/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

const paramsSchema = z.object({ id: z.string().uuid() });

// Every query below is scoped with `and(eq(people.id, id), eq(people.orgId,
// session.orgId))`. A member of org A requesting another org's person id
// gets a 404, identical to "not found" for a non-existent id — this is what
// the cross-tenant test suite (tests/security/authz.test.ts) asserts: no
// information leak distinguishing "exists in another org" from "does not
// exist".
export const GET = secureRoute<{ id: string }>({
  method: "GET",
  path: "/api/people/:id",
  handler: async ({ session, params }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) return jsonError(400, "Invalid id");

    const [row] = await db
      .select()
      .from(people)
      .where(
        and(eq(people.id, parsedParams.data.id), eq(people.orgId, session.orgId), isNull(people.deletedAt)),
      )
      .limit(1);
    if (!row) return jsonError(404, "Not found");

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.read",
      resourceType: "person",
      resourceId: row.id,
      ip: await getClientIp(),
    });

    return NextResponse.json({ person: row });
  },
});

export const PATCH = secureRoute<{ id: string }>({
  method: "PATCH",
  path: "/api/people/:id",
  handler: async ({ request, session, params }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) return jsonError(400, "Invalid id");

    const parsedBody = await readJson(request, personUpdateSchema);
    if (!parsedBody.ok) return parsedBody.response;

    const [row] = await db
      .update(people)
      .set({ ...parsedBody.data, updatedAt: new Date() })
      .where(and(eq(people.id, parsedParams.data.id), eq(people.orgId, session.orgId)))
      .returning();
    if (!row) return jsonError(404, "Not found");

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.update",
      resourceType: "person",
      resourceId: row.id,
      ip: await getClientIp(),
      metadata: { fields: Object.keys(parsedBody.data) },
    });

    return NextResponse.json({ person: row });
  },
});

export const DELETE = secureRoute<{ id: string }>({
  method: "DELETE",
  path: "/api/people/:id",
  handler: async ({ session, params }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) return jsonError(400, "Invalid id");

    const [row] = await db
      .update(people)
      .set({ deletedAt: new Date() })
      .where(and(eq(people.id, parsedParams.data.id), eq(people.orgId, session.orgId)))
      .returning();
    if (!row) return jsonError(404, "Not found");

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.delete",
      resourceType: "person",
      resourceId: row.id,
      ip: await getClientIp(),
    });

    return NextResponse.json({ ok: true });
  },
});
