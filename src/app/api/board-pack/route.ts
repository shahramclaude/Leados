import { getDb } from "@/db";
import { requireTenant } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { buildBoardPack } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const db = getDb();
    const pack = await buildBoardPack(db, tenant.id);
    return Response.json(pack);
  } catch (error) {
    return handleRouteError(error);
  }
}
