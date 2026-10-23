import { NextRequest } from "next/server";
import { synergyItems } from "@/db/schema";
import { updateRow, badRequest, ok } from "@/lib/leados/crud";

// Finance verification is a distinct, auditable action — synergies cannot
// self-verify from the creation form.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!id) return badRequest("invalid id");
  const body = await req.json();
  if (body.action === "verify") {
    const row = await updateRow(synergyItems, synergyItems.id, id, { financeVerified: true });
    return ok(row);
  }
  if (body.action === "unverify") {
    const row = await updateRow(synergyItems, synergyItems.id, id, { financeVerified: false });
    return ok(row);
  }
  return badRequest("Unrecognized action");
}
