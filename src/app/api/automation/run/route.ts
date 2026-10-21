import { getDb } from "@/db";
import { requireTenant } from "@/lib/api-auth";
import { createAutomationRunSchema } from "@/lib/validation";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { runAutomation } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json();
    const input = createAutomationRunSchema.parse(body);
    const db = getDb();
    const row = await runAutomation(db, tenant.id, input);
    if (!row) return jsonError("Approval not found for this tenant", 404);
    return Response.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not approved")) {
      return jsonError(error.message, 422);
    }
    return handleRouteError(error);
  }
}
