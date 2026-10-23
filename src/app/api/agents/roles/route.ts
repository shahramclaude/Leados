import { NextRequest } from "next/server";
import { agentRoles } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

const ALLOWED_RISK_CEILINGS = ["T0", "T1", "T2"]; // digital coworkers never self-authorize T3+

export async function GET() {
  const rows = await listRows(agentRoles, desc(agentRoles.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.humanAccountable) {
    return badRequest("title and humanAccountable are required — no agent role may exist without a human owner.");
  }
  if (String(body.humanAccountable).trim().length === 0) {
    return badRequest("humanAccountable cannot be blank.");
  }
  const riskCeiling = body.riskCeiling || "T1";
  if (!ALLOWED_RISK_CEILINGS.includes(riskCeiling)) {
    return badRequest("riskCeiling must be T0, T1, or T2 — higher-risk actions must route to a human.");
  }
  const row = await createRow(agentRoles, {
    title: body.title,
    responsibilities: body.responsibilities || "",
    forbidden: body.forbidden || "",
    riskCeiling,
    humanAccountable: body.humanAccountable,
    evalSuiteId: body.evalSuiteId || "",
    supervisionSlaHours: String(body.supervisionSlaHours ?? 24),
    active: true,
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(agentRoles, agentRoles.id, id);
  return ok({ ok: true });
}
