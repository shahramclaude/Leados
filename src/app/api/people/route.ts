import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { readJson, secureRoute } from "@/lib/apiUtils";
import { personCreateSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

export const GET = secureRoute({
  method: "GET",
  path: "/api/people",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    // Tenant scoping happens here, in the repository query, never from a
    // client-supplied org id — this is the control that makes cross-tenant
    // access structurally impossible rather than merely checked.
    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.orgId, s.orgId), isNull(people.deletedAt)))
      .orderBy(desc(people.createdAt))
      .limit(200);

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.list",
      resourceType: "people",
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    }).catch(() => {});

    return NextResponse.json({ people: rows });
  },
});

export const POST = secureRoute({
  method: "POST",
  path: "/api/people",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const parsed = await readJson(request, personCreateSchema);
    if (!parsed.ok) return parsed.response;

    const [person] = await db
      .insert(people)
      .values({ orgId: s.orgId, ...parsed.data })
      .returning();

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.create",
      resourceType: "people",
      resourceId: person.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });

    return NextResponse.json({ person }, { status: 201 });
  },
});


