import { db } from "@/db";
import { findings } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { ValidationError } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { updateFindingSchema } from "@/lib/api/schemas";
import { updateBeta } from "@/lib/domain/beta";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("id must be a positive integer");
  }
  return id;
}

async function loadScoped(id: number, tenantId: number) {
  const rows = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, id), eq(findings.tenantId, tenantId)))
    .limit(1);
  const finding = rows[0];
  if (!finding) throw new NotFoundError("Finding not found");
  return finding;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    const id = parseId((await params).id);
    const finding = await loadScoped(id, auth.tenantId);
    return Response.json(finding);
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
    const body = updateFindingSchema.parse(await request.json());
    const existing = await loadScoped(id, auth.tenantId);

    let { confidenceAlpha, confidenceBeta } = existing;
    if (body.observeOutcome !== undefined) {
      const updated = updateBeta(
        { alpha: confidenceAlpha, beta: confidenceBeta },
        body.observeOutcome,
      );
      confidenceAlpha = updated.alpha;
      confidenceBeta = updated.beta;
    }

    const [updatedRow] = await db
      .update(findings)
      .set({
        status: body.status ?? existing.status,
        confidenceAlpha,
        confidenceBeta,
      })
      .where(and(eq(findings.id, id), eq(findings.tenantId, auth.tenantId)))
      .returning();

    return Response.json(updatedRow);
  } catch (error) {
    return errorResponse(error);
  }
}
