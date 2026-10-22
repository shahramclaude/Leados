import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { deleteSeededRecords } from "@/lib/repo/engineRecords";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await requireContext("POST", "/api/onboarding/remove-sample");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const removed = await deleteSeededRecords(ctx.orgId);
  return NextResponse.json({ ok: true, removed });
}
