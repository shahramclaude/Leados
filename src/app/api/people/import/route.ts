import { NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { processImportUpload } from "@/lib/importPeople";
import { MAX_IMPORT_BYTES } from "@/lib/validation/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

// Content-Length is checked before reading the body so an oversized upload
// is rejected without buffering it fully in memory. The actual bytes are
// then sniffed (src/lib/importPeople.ts) regardless of the declared
// Content-Type header, since a client can lie about it.
export const POST = secureRoute({
  method: "POST",
  path: "/api/people/import",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_IMPORT_BYTES) {
      return jsonError(413, `Upload exceeds ${MAX_IMPORT_BYTES} byte limit`);
    }

    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_IMPORT_BYTES) {
      return jsonError(413, `Upload exceeds ${MAX_IMPORT_BYTES} byte limit`);
    }

    const result = processImportUpload(buffer);
    if (!result.ok) {
      await recordAuditEvent({
        orgId: session.orgId,
        actorUserId: session.userId,
        actorRole: session.role,
        action: "people.import",
        resourceType: "person",
        reason: "quarantined: failed validation/content sniffing",
        ip: await getClientIp(),
        metadata: { quarantined: true, issueCount: result.issues.length, issues: result.issues.slice(0, 20) },
      });
      return jsonError(422, "Import quarantined: file failed validation", { issues: result.issues });
    }

    const inserted = await db.transaction(async (tx) => {
      const rows = result.rows.map((r) => ({
        orgId: session.orgId,
        createdByUserId: session.userId,
        fullName: r.fullName,
        email: r.email || null,
        phone: r.phone || null,
      }));
      if (rows.length === 0) return [];
      return tx.insert(people).values(rows).returning({ id: people.id });
    });

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.import",
      resourceType: "person",
      ip: await getClientIp(),
      metadata: { quarantined: false, rowCount: inserted.length },
    });

    return NextResponse.json({ imported: inserted.length });
  },
});
