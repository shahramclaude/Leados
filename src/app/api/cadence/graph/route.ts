import { NextResponse } from "next/server";
import { getCadenceGraph } from "@/lib/cadence/graph";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);
  const graph = await getCadenceGraph(orgId);
  return NextResponse.json({ orgId, ...graph });
}
