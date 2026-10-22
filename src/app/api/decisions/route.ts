import { db } from "@/db";
import { decisions, findings } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { parsePageParams, toPagedResult } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { createDecisionSchema } from "@/lib/api/schemas";
import { count, eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const page = parsePageParams(url);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(decisions)
        .where(eq(decisions.tenantId, auth.tenantId))
        .orderBy(decisions.id)
        .limit(page.pageSize)
        .offset(page.offset),
      db
        .select({ value: count() })
        .from(decisions)
        .where(eq(decisions.tenantId, auth.tenantId)),
    ]);

    return Response.json(toPagedResult(rows, totalRow[0]?.value ?? 0, page));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = createDecisionSchema.parse(await request.json());

    const findingRows = await db
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(eq(findings.id, body.findingId), eq(findings.tenantId, auth.tenantId)),
      )
      .limit(1);
    if (!findingRows[0]) {
      throw new NotFoundError(
        `Finding ${body.findingId} not found for this tenant`,
      );
    }

    const [created] = await db
      .insert(decisions)
      .values({
        tenantId: auth.tenantId,
        findingId: body.findingId,
        title: body.title,
        rationale: body.rationale,
        optimisticEstimate: body.optimisticEstimate,
        likelyEstimate: body.likelyEstimate,
        pessimisticEstimate: body.pessimisticEstimate,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
