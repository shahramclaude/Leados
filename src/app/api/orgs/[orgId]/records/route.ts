import { NextResponse } from "next/server";
import { requireContext, requireDomainScope, requireMatchingOrg } from "@/lib/api-helpers";
import { createRecord, listRecords } from "@/lib/repo/engineRecords";
import type { DomainScope, EngineRecordType } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const result = await requireContext("GET", `/api/orgs/${orgId}/records`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") ?? undefined) as DomainScope | undefined;
  const type = (url.searchParams.get("type") ?? undefined) as EngineRecordType | undefined;

  if (domain) {
    const forbidden = requireDomainScope(ctx, domain, "read");
    if (forbidden) return forbidden;
  }

  const rows = await listRecords(ctx.orgId, { domain, type });
  return NextResponse.json({ records: rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const result = await requireContext("POST", `/api/orgs/${orgId}/records`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const body = (await request.json()) as {
    type: EngineRecordType;
    domain: DomainScope;
    templateKey: string;
    params: Record<string, string | number>;
  };

  const forbidden = requireDomainScope(ctx, body.domain, "write");
  if (forbidden) return forbidden;

  const row = await createRecord(ctx.orgId, { ...body, createdBy: ctx.userId });
  return NextResponse.json({ record: row }, { status: 201 });
}
