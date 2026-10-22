import { db } from "@/db";
import { approvals, decisions } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { parsePageParams, toPagedResult } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { createApprovalSchema } from "@/lib/api/schemas";
import { and, count, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const page = parsePageParams(url);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(approvals)
        .where(eq(approvals.tenantId, auth.tenantId))
        .orderBy(approvals.id)
        .limit(page.pageSize)
        .offset(page.offset),
      db
        .select({ value: count() })
        .from(approvals)
        .where(eq(approvals.tenantId, auth.tenantId)),
    ]);

    return Response.json(toPagedResult(rows, totalRow[0]?.value ?? 0, page));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = createApprovalSchema.parse(await request.json());

    const decisionRows = await db
      .select({ id: decisions.id })
      .from(decisions)
      .where(
        and(
          eq(decisions.id, body.decisionId),
          eq(decisions.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    if (!decisionRows[0]) {
      throw new NotFoundError(
        `Decision ${body.decisionId} not found for this tenant`,
      );
    }

    const [created] = await db
      .insert(approvals)
      .values({
        tenantId: auth.tenantId,
        decisionId: body.decisionId,
        approverId: auth.userId,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
