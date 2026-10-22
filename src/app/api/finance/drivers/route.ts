// Part 08 — GET: driver metadata + full time series (for the Driver Tree
// sparkline + override list). PATCH: commit an asserted override (persisted,
// marks the driver + all downstream formulas "asserted" until replaced).

import { NextRequest } from "next/server";
import { evaluateModel, getModelNodes } from "@/lib/finance/financeEngine";
import { MONTHS } from "@/lib/finance/timeline";
import { loadOverrideMap, listOverrides, saveOverride } from "@/lib/finance/overridesStore";
import { clearDagCache } from "@/lib/finance/dag";

export const dynamic = "force-dynamic";

export async function GET() {
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const nodes = getModelNodes().filter((n) => n.type === "driver");
  const drivers = nodes.map((n) => {
    const evaluated = model.nodes[n.id];
    return {
      id: n.id,
      label: n.label,
      group: n.group,
      unit: n.unit,
      description: n.description,
      relUncertainty: n.relUncertainty ?? null,
      values: evaluated.values,
      confidence: evaluated.confidence,
    };
  });
  const overrides = await listOverrides();
  return Response.json({ months: MONTHS, drivers, overrides });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { driverId?: string; month?: string; value?: number; assertedBy?: string; note?: string }
    | null;
  if (!body || !body.driverId || !body.month || typeof body.value !== "number" || Number.isNaN(body.value)) {
    return Response.json({ error: "driverId, month (YYYY-MM), and numeric value are required" }, { status: 400 });
  }
  const nodes = getModelNodes();
  const driverExists = nodes.some((n) => n.id === body.driverId && n.type === "driver");
  if (!driverExists) {
    return Response.json({ error: `Unknown driver id "${body.driverId}"` }, { status: 400 });
  }
  if (!MONTHS.includes(body.month)) {
    return Response.json({ error: `Unknown month "${body.month}"` }, { status: 400 });
  }
  const saved = await saveOverride({
    driverId: body.driverId,
    month: body.month,
    value: body.value,
    assertedBy: body.assertedBy,
    note: body.note,
  });
  clearDagCache();
  return Response.json({ override: saved });
}
