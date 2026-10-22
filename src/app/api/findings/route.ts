import { db } from "@/db";
import { findings } from "@/db/schema";
import { requireAuth } from "@/lib/api/auth";
import { parsePageParams, toPagedResult } from "@/lib/api/pagination";
import { errorResponse } from "@/lib/api/respond";
import { count, eq } from "drizzle-orm";
import { createFindingSchema } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const page = parsePageParams(url);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(findings)
        .where(eq(findings.tenantId, auth.tenantId))
        .orderBy(findings.id)
        .limit(page.pageSize)
        .offset(page.offset),
      db
        .select({ value: count() })
        .from(findings)
        .where(eq(findings.tenantId, auth.tenantId)),
    ]);

    return Response.json(toPagedResult(rows, totalRow[0]?.value ?? 0, page));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = createFindingSchema.parse(await request.json());

    const [created] = await db
      .insert(findings)
      .values({
        tenantId: auth.tenantId,
        title: body.title,
        description: body.description,
        createdBy: auth.userId,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
