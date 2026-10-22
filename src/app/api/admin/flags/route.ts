import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { createFlag, listAudit, listFlags, setFlag } from "@/lib/repo/featureFlags";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireContext("GET", "/api/admin/flags");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const [flags, audit] = await Promise.all([listFlags(ctx.orgId), listAudit(ctx.orgId)]);
  return NextResponse.json({ flags, audit });
}

export async function POST(request: Request) {
  const result = await requireContext("POST", "/api/admin/flags");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const body = (await request.json()) as { key: string };
  if (!body.key) return NextResponse.json({ error: "key-required" }, { status: 400 });

  const row = await createFlag(ctx.orgId, body.key, ctx.userId);
  return NextResponse.json({ flag: row }, { status: 201 });
}

export async function PATCH(request: Request) {
  const result = await requireContext("PATCH", "/api/admin/flags");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const body = (await request.json()) as { key: string; enabled: boolean };
  const row = await setFlag(ctx.orgId, body.key, body.enabled, ctx.userId);
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json({ flag: row });
}
