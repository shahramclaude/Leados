import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { readJson, secureRoute } from "@/lib/apiUtils";
import { incidentBannerSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

const BANNER_KEY = "incident_banner";

export const GET = secureRoute({
  method: "GET",
  path: "/api/admin/incident-banner",
  handler: async () => {
    const [row] = await db.select().from(settings).where(eq(settings.key, BANNER_KEY));
    return NextResponse.json({ banner: row?.value ?? { enabled: false, message: "" } });
  },
});

// Incident-mode banner (Part 19 Phase 2): a visible, auditable, admin-only
// toggle for "we know something is wrong and are telling users" — not a
// substitute for the runbooks in docs/RUNBOOKS.md, just the UI surface for
// the communication half of incident response.
export const PATCH = secureRoute({
  method: "PATCH",
  path: "/api/admin/incident-banner",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const parsed = await readJson(request, incidentBannerSchema);
    if (!parsed.ok) return parsed.response;

    await db
      .insert(settings)
      .values({ key: BANNER_KEY, value: parsed.data, updatedBy: s.userId })
      .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data, updatedBy: s.userId, updatedAt: new Date() } });

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "settings.incident_banner_change",
      resourceType: "settings",
      resourceId: BANNER_KEY,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: parsed.data,
    });

    return NextResponse.json({ banner: parsed.data });
  },
});
