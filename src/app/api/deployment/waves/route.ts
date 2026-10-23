import { NextRequest } from "next/server";
import { rolloutWaves } from "@/db/schema";
import { listRows, createRow, updateRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { waveEntryReady } from "@/lib/leados/calc";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return {
    ...row,
    entryReady: waveEntryReady({
      dataReady: Boolean(row.dataReady),
      trained: Boolean(row.trained),
      pilotPassed: Boolean(row.pilotPassed),
      rollbackReady: Boolean(row.rollbackReady),
    }),
  };
}

export async function GET() {
  const rows = await listRows(rolloutWaves, desc(rolloutWaves.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.cohortName) return badRequest("cohortName is required");
  const row = await createRow(rolloutWaves, {
    tenantId: body.tenantId ? Number(body.tenantId) : null,
    waveNumber: Number(body.waveNumber) || 1,
    cohortName: body.cohortName,
    users: Number(body.users) || 0,
    dataReady: body.dataReady === true || body.dataReady === "true",
    trained: body.trained === true || body.trained === "true",
    pilotPassed: body.pilotPassed === true || body.pilotPassed === "true",
    rollbackReady: body.rollbackReady === true || body.rollbackReady === "true",
    status: "planned",
  });
  return ok(augment(row), 201);
}

// Starting a wave is gated: all four entry criteria must be true, enforced
// server-side even if a UI bug or a direct API call tries to skip the gate.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return badRequest("id required");
  if (body.action === "start") {
    const [existing] = await db.select().from(rolloutWaves).where(eq(rolloutWaves.id, id));
    if (!existing) return badRequest("wave not found");
    const ready = waveEntryReady({
      dataReady: Boolean(existing.dataReady),
      trained: Boolean(existing.trained),
      pilotPassed: Boolean(existing.pilotPassed),
      rollbackReady: Boolean(existing.rollbackReady),
    });
    if (!ready) {
      return badRequest("Wave entry criteria not met: dataReady, trained, pilotPassed and rollbackReady must all be true.");
    }
    const row = await updateRow(rolloutWaves, rolloutWaves.id, id, { status: "active" });
    return ok(augment(row));
  }
  const fields: Record<string, unknown> = {};
  for (const key of ["dataReady", "trained", "pilotPassed", "rollbackReady"]) {
    if (body[key] !== undefined) fields[key] = body[key] === true || body[key] === "true";
  }
  if (body.adoptionPct !== undefined) fields.adoptionPct = String(body.adoptionPct);
  const row = await updateRow(rolloutWaves, rolloutWaves.id, id, fields);
  return ok(augment(row));
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(rolloutWaves, rolloutWaves.id, id);
  return ok({ ok: true });
}
