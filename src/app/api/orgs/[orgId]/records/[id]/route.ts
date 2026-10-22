import { NextResponse } from "next/server";
import { requireContext, requireDomainScope, requireMatchingOrg } from "@/lib/api-helpers";
import { deleteRecord, getRecord, updateRecordWithVersion } from "@/lib/repo/engineRecords";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const result = await requireContext("GET", `/api/orgs/${orgId}/records/${id}`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const row = await getRecord(ctx.orgId, id);
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ record: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const result = await requireContext("PATCH", `/api/orgs/${orgId}/records/${id}`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const existing = await getRecord(ctx.orgId, id);
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const forbidden = requireDomainScope(ctx, existing.domain, "write");
  if (forbidden) return forbidden;

  const body = (await request.json()) as { expectedVersion: number; params: Record<string, string | number> };

  const outcome = await updateRecordWithVersion(ctx.orgId, id, body.expectedVersion, {
    params: body.params,
    updatedBy: ctx.userId,
  });

  if (outcome.status === "not-found") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (outcome.status === "conflict") {
    // Documented conflict semantics: never silently overwrite. The client
    // receives the authoritative server row plus its own attempted patch so
    // it can render a mine/theirs/merge dialog.
    return NextResponse.json(
      { error: "version-conflict", serverRecord: outcome.serverRow, attemptedParams: body.params },
      { status: 409 },
    );
  }

  return NextResponse.json({ record: outcome.row });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  const result = await requireContext("DELETE", `/api/orgs/${orgId}/records/${id}`, orgId);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const orgMismatch = requireMatchingOrg(ctx, orgId);
  if (orgMismatch) return orgMismatch;

  const ok = await deleteRecord(ctx.orgId, id);
  if (!ok) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
