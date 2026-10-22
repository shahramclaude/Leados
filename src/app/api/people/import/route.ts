import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { readJson, secureRoute } from "@/lib/apiUtils";
import { importCreateSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

// Import quarantine (Part 19 Phase 1-c "injection surfaces"): a submitted
// batch is validated row-by-row with the exact same strict zod schema used
// for interactive creation (no separate, looser "bulk" code path to drift
// out of sync) and stored as `pending` — nothing is written to `people`
// until an admin explicitly approves the batch via
// POST /api/people/import/:id/approve. This bounds the blast radius of a
// compromised or malicious data source (CSV from an untrusted partner,
// scraped lead list, etc.) to "an admin has to look at it first".
export const POST = secureRoute({
  method: "POST",
  path: "/api/people/import",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const parsed = await readJson(request, importCreateSchema);
    if (!parsed.ok) return parsed.response;

    const [batch] = await db
      .insert(importBatches)
      .values({ orgId: s.orgId, createdBy: s.userId, status: "pending", rows: parsed.data.rows })
      .returning();

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.import.submit",
      resourceType: "import_batch",
      resourceId: batch.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { rowCount: parsed.data.rows.length },
    });

    return NextResponse.json({ batch: { id: batch.id, status: batch.status, rowCount: parsed.data.rows.length } }, { status: 201 });
  },
});

export const GET = secureRoute({
  method: "GET",
  path: "/api/people/import",
  handler: async ({ session }: { session: SessionUser | null }) => {
    const s = session!;
    const rows = await db
      .select({ id: importBatches.id, status: importBatches.status, createdAt: importBatches.createdAt, rows: importBatches.rows })
      .from(importBatches)
      .where(and(eq(importBatches.orgId, s.orgId)))
      .orderBy(desc(importBatches.createdAt));
    return NextResponse.json({ batches: rows.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, rowCount: Array.isArray(r.rows) ? r.rows.length : 0 })) });
  },
});
