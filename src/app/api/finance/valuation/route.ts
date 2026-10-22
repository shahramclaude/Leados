// Part 08 — GET/POST: DCF-lite scenario/valuation bridge with a wacc x
// growth sensitivity grid. POST accepts what-if driver overrides so a
// scenario can flow from driver change -> projected statements -> EV.

import { NextRequest } from "next/server";
import { evaluateModel, computeValuation } from "@/lib/finance/financeEngine";
import { loadOverrideMap } from "@/lib/finance/overridesStore";
import { mergeOverrides, OverrideMap } from "@/lib/finance/dag";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wacc = req.nextUrl.searchParams.get("wacc");
  const growth = req.nextUrl.searchParams.get("growth");
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const result = computeValuation(model, wacc ? Number(wacc) : undefined, growth ? Number(growth) : undefined);
  return Response.json(result);
}

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as {
    overrides?: OverrideMap;
    wacc?: number;
    growth?: number;
  };
  const persisted = await loadOverrideMap();
  const merged = mergeOverrides(persisted, payload.overrides ?? {});
  const model = evaluateModel(merged);
  const result = computeValuation(model, payload.wacc, payload.growth);
  return Response.json(result);
}
