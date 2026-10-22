import { db } from "@/db";
import { approvals, boardPacks, decisions, findings } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { parsePageParams, toPagedResult } from "@/lib/api/pagination";
import { errorResponse } from "@/lib/api/respond";
import { createBoardPackSchema } from "@/lib/api/schemas";
import { and, count, eq, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const page = parsePageParams(url);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(boardPacks)
        .where(eq(boardPacks.tenantId, auth.tenantId))
        .orderBy(boardPacks.id)
        .limit(page.pageSize)
        .offset(page.offset),
      db
        .select({ value: count() })
        .from(boardPacks)
        .where(eq(boardPacks.tenantId, auth.tenantId)),
    ]);

    return Response.json(toPagedResult(rows, totalRow[0]?.value ?? 0, page));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Builds a board pack summarizing findings/decisions/approvals in a period. */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = createBoardPackSchema.parse(await request.json());
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);

    const [findingsCount, decisionsCount, approvalsCount] = await Promise.all([
      db
        .select({ value: count() })
        .from(findings)
        .where(
          and(
            eq(findings.tenantId, auth.tenantId),
            gte(findings.createdAt, periodStart),
            lte(findings.createdAt, periodEnd),
          ),
        ),
      db
        .select({ value: count() })
        .from(decisions)
        .where(
          and(
            eq(decisions.tenantId, auth.tenantId),
            gte(decisions.createdAt, periodStart),
            lte(decisions.createdAt, periodEnd),
          ),
        ),
      db
        .select({ value: count() })
        .from(approvals)
        .where(
          and(
            eq(approvals.tenantId, auth.tenantId),
            gte(approvals.createdAt, periodStart),
            lte(approvals.createdAt, periodEnd),
          ),
        ),
    ]);

    const [created] = await db
      .insert(boardPacks)
      .values({
        tenantId: auth.tenantId,
        title: body.title,
        periodStart,
        periodEnd,
        summary: {
          findings: findingsCount[0]?.value ?? 0,
          decisions: decisionsCount[0]?.value ?? 0,
          approvals: approvalsCount[0]?.value ?? 0,
        },
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
