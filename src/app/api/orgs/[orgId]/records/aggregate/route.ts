import { NextResponse } from "next/server";
import { requireContext, requireMatchingOrg } from "@/lib/api-helpers";
import { aggregateByDomain } from "@/lib/repo/engineRecords";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const result = await requireContext("GET", `/api/orgs/${orgId}/records/aggregate`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const aggregate = await aggregateByDomain(ctx.orgId);
  return NextResponse.json({ aggregate });
}
