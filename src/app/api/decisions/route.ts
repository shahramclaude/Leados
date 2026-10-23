import { NextRequest } from "next/server";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { appendAuditEvent } from "@/lib/audit";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.orgId, DEFAULT_ORG_ID))
    .orderBy(desc(decisions.createdAt));
  return Response.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.question || typeof body.question !== "string") {
    return Response.json({ code: "validation_error", detail: "question is required" }, { status: 400 });
  }
  const alternatives = Array.isArray(body.alternatives) ? body.alternatives : [];
  const [row] = await db
    .insert(decisions)
    .values({ orgId: DEFAULT_ORG_ID, question: body.question, alternatives, status: "open" })
    .returning();
  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: "decision.created",
    entityType: "decision",
    entityId: row.id,
    metadata: { question: row.question },
  });
  return Response.json({ item: row }, { status: 201 });
}
