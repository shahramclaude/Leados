import { getDb } from "@/db";
import { requireTenant } from "@/lib/api-auth";
import { createFindingSchema, paginationSchema } from "@/lib/validation";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { createFinding, listFindings } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const { page, pageSize } = paginationSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    const db = getDb();
    const { rows, total } = await listFindings(db, tenant.id, page, pageSize);
    return Response.json({ data: rows, page, pageSize, total });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json();
    const input = createFindingSchema.parse(body);
    const db = getDb();
    const row = await createFinding(db, tenant.id, input);
    if (!row) return jsonError("Lead not found for this tenant", 404);
    return Response.json(row, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
