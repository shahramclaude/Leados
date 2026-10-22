import { db } from "@/db";
import { decisions } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { ValidationError } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { updateDecisionSchema } from "@/lib/api/schemas";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("id must be a positive integer");
  }
  return id;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const id = parseId((await params).id);
    const rows = await db
      .select()
      .from(decisions)
      .where(and(eq(decisions.id, id), eq(decisions.tenantId, auth.tenantId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Decision not found");
    return Response.json(rows[0]);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const id = parseId((await params).id);
    const body = updateDecisionSchema.parse(await request.json());

    const existingRows = await db
      .select({ id: decisions.id })
      .from(decisions)
      .where(and(eq(decisions.id, id), eq(decisions.tenantId, auth.tenantId)))
      .limit(1);
    if (!existingRows[0]) throw new NotFoundError("Decision not found");

    const [updated] = await db
      .update(decisions)
      .set({ status: body.status })
      .where(and(eq(decisions.id, id), eq(decisions.tenantId, auth.tenantId)))
      .returning();

    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
