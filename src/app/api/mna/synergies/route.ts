import { NextRequest } from "next/server";
import { synergyItems } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { countableSynergyUsd, synergyVariancePct } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

// Unverified synergies cannot count toward targets — enforced at query/read level,
// never left to UI convention.
function augment(row: Record<string, unknown>) {
  return {
    ...row,
    countableUsd: countableSynergyUsd(Number(row.achievedRunRateUsd), Boolean(row.financeVerified)),
    variancePct: synergyVariancePct(Number(row.plannedRunRateUsd), Number(row.achievedRunRateUsd)),
  };
}

export async function GET() {
  const rows = await listRows(synergyItems, desc(synergyItems.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.label) return badRequest("label is required");
  const row = await createRow(synergyItems, {
    planId: body.planId ? Number(body.planId) : null,
    label: body.label,
    kind: body.kind || "cost",
    plannedRunRateUsd: String(body.plannedRunRateUsd ?? 0),
    achievedRunRateUsd: String(body.achievedRunRateUsd ?? 0),
    oneTimeCostsUsd: String(body.oneTimeCostsUsd ?? 0),
    financeVerified: body.financeVerified === true || body.financeVerified === "true",
    confidence: String(body.confidence ?? 0.5),
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(synergyItems, synergyItems.id, id);
  return ok({ ok: true });
}
