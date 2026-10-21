import { db } from "@/db";
import { findings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { findExistingMutation, recordAudit, recordMutation } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(findings).where(eq(findings.objectiveId, id)).orderBy(desc(findings.createdAt));
  return Response.json({ items: rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idempotencyKey = request.headers.get("idempotency-key");
  const body = (await request.json()) as {
    id?: string;
    title?: string;
    body?: string;
    confidence?: string;
  };

  if (idempotencyKey) {
    const existing = await findExistingMutation(idempotencyKey);
    if (existing) return Response.json(existing.resultJson, { status: 201 });
  }

  if (!body.title || body.title.trim().length < 3) {
    return Response.json(
      { code: "VALIDATION", message: "Finding title must be at least 3 characters.", field: "title" },
      { status: 422 },
    );
  }
  if (!body.body || body.body.trim().length < 5) {
    return Response.json(
      { code: "VALIDATION", message: "Describe the finding in at least 5 characters.", field: "body" },
      { status: 422 },
    );
  }

  const [row] = await db
    .insert(findings)
    .values({
      id: body.id,
      objectiveId: id,
      title: body.title.trim(),
      body: body.body.trim(),
      confidence: body.confidence ?? "medium",
    })
    .returning();

  await recordAudit("finding", row.id, "created", `Finding "${row.title}" added`);
  if (idempotencyKey) await recordMutation(idempotencyKey, "finding", "applied", row);

  return Response.json(row, { status: 201 });
}
