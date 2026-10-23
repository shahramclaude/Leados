import { NextRequest } from "next/server";
import { fitnessFunctions } from "@/db/schema";
import { listRows, createRow, updateRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { ratchetPasses, nextBest } from "@/lib/leados/calc";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return {
    ...row,
    ratchetOk: ratchetPasses(Number(row.currentValue), Number(row.bestValue), row.direction as "max" | "min"),
  };
}

export async function GET() {
  const rows = await listRows(fitnessFunctions, desc(fitnessFunctions.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || body.currentValue === undefined) return badRequest("name and currentValue are required");
  const direction = body.direction || "max";
  const currentValue = Number(body.currentValue);
  const row = await createRow(fitnessFunctions, {
    name: body.name,
    kind: body.kind || "structure",
    measure: body.measure || "",
    threshold: String(body.threshold ?? 0),
    direction,
    enforcement: body.enforcement || "ratchet",
    currentValue: String(currentValue),
    bestValue: String(currentValue),
  });
  return ok(augment(row), 201);
}

// Report a new measurement. The ratchet enforces that the value may only
// improve relative to the historical best — a regression is flagged, never
// silently accepted as the new baseline.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return badRequest("id required");
  const [existing] = await db.select().from(fitnessFunctions).where(eq(fitnessFunctions.id, id));
  if (!existing) return badRequest("fitness function not found");
  const newValue = Number(body.currentValue);
  const direction = existing.direction as "max" | "min";
  const passes = ratchetPasses(newValue, Number(existing.bestValue), direction);
  const enforcement = String(existing.enforcement);
  if (!passes && enforcement === "block") {
    return badRequest(
      `Ratchet violation blocked: ${existing.name} regressed from best ${existing.bestValue} to ${newValue} (direction: ${direction}).`
    );
  }
  const best = nextBest(newValue, Number(existing.bestValue), direction);
  const row = await updateRow(fitnessFunctions, fitnessFunctions.id, id, {
    currentValue: String(newValue),
    bestValue: String(best),
  });
  return ok(augment(row));
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(fitnessFunctions, fitnessFunctions.id, id);
  return ok({ ok: true });
}
