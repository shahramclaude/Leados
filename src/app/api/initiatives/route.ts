import { NextRequest } from "next/server";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { appendAuditEvent } from "@/lib/audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(initiatives).where(eq(initiatives.orgId, DEFAULT_ORG_ID));
  return Response.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title) {
    return Response.json({ code: "validation_error", detail: "title is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(initiatives)
    .values({
      orgId: DEFAULT_ORG_ID,
      objectiveId: body.objectiveId ?? null,
      title: body.title,
      summary: body.summary ?? null,
      status: body.status ?? "planned",
      riskTier: body.riskTier ?? "T1",
      budgetUsd: body.budgetUsd ?? 0,
      progressPct: body.progressPct ?? 0,
    })
    .returning();
  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: "initiative.created",
    entityType: "initiative",
    entityId: row.id,
    metadata: { title: row.title },
  });
  return Response.json({ item: row }, { status: 201 });
}
