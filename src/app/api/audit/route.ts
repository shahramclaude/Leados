import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { verifyAuditChain } from "@/lib/audit";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, DEFAULT_ORG_ID))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
  const verification = await verifyAuditChain(DEFAULT_ORG_ID);
  return Response.json({ items: rows, verification });
}
