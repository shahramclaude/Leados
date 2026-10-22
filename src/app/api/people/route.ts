import { NextRequest } from "next/server";
import { resolveDemoTenantId } from "@/lib/demoTenant";
import { listPeoplePage } from "@/db/repositories/people";
import { parsePageParams } from "@/db/repositories/pagination";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenantId = await resolveDemoTenantId();
  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePageParams(searchParams);
  const team = searchParams.get("team") ?? undefined;

  const page = await listPeoplePage(tenantId, { limit, offset, team });
  return Response.json(page, { headers: { "Cache-Control": "no-store" } });
}
