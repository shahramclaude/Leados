import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { parseQuery, secureRoute } from "@/lib/apiUtils";
import { personSearchSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

// Injection-hardening note: `q` is always bound as a Drizzle parameter via
// `ilike()`; it is never concatenated into a raw SQL string. A literal `%`
// or `_` in `q` only behaves as a wildcard (functionally benign — it can
// only make the search broader, never escape the query), which is why
// `tests/security/injection-and-validation.test.ts`-style SQLi payloads are
// exercised directly against this handler in this session's test suite.
export const GET = secureRoute({
  method: "GET",
  path: "/api/people/search",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const url = new URL(request.url);
    const parsed = parseQuery(url, personSearchSchema);
    if (!parsed.ok) return parsed.response;

    const term = `%${parsed.data.q}%`;
    const rows = await db
      .select()
      .from(people)
      .where(
        and(
          eq(people.orgId, s.orgId),
          isNull(people.deletedAt),
          or(ilike(people.firstName, term), ilike(people.lastName, term), ilike(people.email, term)),
        ),
      )
      .limit(50);

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.search",
      resourceType: "people",
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { queryLength: parsed.data.q.length },
    }).catch(() => {});

    return NextResponse.json({ people: rows });
  },
});
