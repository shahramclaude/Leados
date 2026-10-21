import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { can } from "@/lib/permissions";
import { verifyChain } from "@/lib/envelope";
import { ForbiddenServiceError } from "@/lib/errors";
import type { SessionContext } from "@/lib/demo-auth";

export async function listEvents(session: SessionContext) {
  if (!can(session.role, "audit:read")) {
    throw new ForbiddenServiceError("Role lacks audit:read");
  }
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, session.orgId))
    .orderBy(desc(events.createdAt))
    .limit(200);
  const chain = await verifyChain(session.orgId);
  return { events: rows, chain };
}
