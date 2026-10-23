import { NextRequest } from "next/server";
import { policies } from "@/db/schema";
import { listRows, createRow, updateRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { canTransitionPolicy } from "@/lib/leados/calc";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(policies, desc(policies.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) return badRequest("name is required");
  const row = await createRow(policies, {
    name: body.name,
    state: "draft",
    reviewEveryDays: Number(body.reviewEveryDays) || 90,
    evidenceOfEffect: body.evidenceOfEffect || "",
    sunsetTrigger: body.sunsetTrigger || "",
  });
  return ok(row, 201);
}

// Lifecycle transitions are validated against the legal-transition table; a
// policy without effect evidence that reaches "review-due" can only move to
// "sunset", never silently re-adopt itself.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  const to = String(body.to || "");
  if (!id || !to) return badRequest("id and to are required");
  const [existing] = await db.select().from(policies).where(eq(policies.id, id));
  if (!existing) return badRequest("policy not found");
  if (!canTransitionPolicy(String(existing.state), to)) {
    return badRequest(`Illegal transition: ${existing.state} → ${to}`);
  }
  if (to === "adopted" && existing.state === "review-due" && !existing.evidenceOfEffect) {
    return badRequest("Cannot re-adopt at review without evidence of effect — the policy must earn its keep.");
  }
  const values: Record<string, unknown> = { state: to };
  if (to === "adopted" && !existing.adoptedAt) values.adoptedAt = new Date();
  const row = await updateRow(policies, policies.id, id, values);
  return ok(row);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(policies, policies.id, id);
  return ok({ ok: true });
}
