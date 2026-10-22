// Part 08 — GET: current (or what-if) model snapshot for the Driver Tree /
// P&L views. POST: ephemeral what-if recompute (drag-a-driver preview),
// never persisted.

import { NextRequest } from "next/server";
import { evaluateModel, getModelNodes, HISTORY_MONTHS, CUTOVER_INDEX } from "@/lib/finance/financeEngine";
import { MONTHS } from "@/lib/finance/timeline";
import { loadOverrideMap } from "@/lib/finance/overridesStore";
import { mergeOverrides, OverrideMap } from "@/lib/finance/dag";
import { FactLedger } from "@/lib/finance/citations";
import { snapshotAt } from "@/lib/finance/financeEngine";
import { incomeStatementAt, balanceSheetAt, cashFlowStatementAt, checkIdentitiesAt } from "@/lib/finance/financialStatements";

export const dynamic = "force-dynamic";

function resolveMonthIndex(month: string | null): number {
  if (!month) return CUTOVER_INDEX;
  const idx = MONTHS.indexOf(month);
  return idx === -1 ? CUTOVER_INDEX : idx;
}

function nodeTreeSummary(model: ReturnType<typeof evaluateModel>, monthIndex: number) {
  const nodes = getModelNodes();
  return nodes.map((n) => {
    const evaluated = model.nodes[n.id];
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      group: n.group,
      unit: n.unit,
      description: n.description,
      value: evaluated.values[monthIndex],
      confidence: evaluated.confidence[monthIndex],
      relUncertainty: n.relUncertainty ?? null,
    };
  });
}

async function buildResponse(overrides: OverrideMap, monthParam: string | null) {
  const model = evaluateModel(overrides);
  const monthIndex = resolveMonthIndex(monthParam);
  const ledger = new FactLedger();
  const snapshot = snapshotAt(model, ledger, monthIndex);
  return {
    hash: model.hash,
    months: model.months,
    historyMonths: HISTORY_MONTHS,
    cutoverIndex: CUTOVER_INDEX,
    monthIndex,
    evalMs: model.evalMs,
    nodes: nodeTreeSummary(model, monthIndex),
    incomeStatement: incomeStatementAt(model, monthIndex),
    balanceSheet: balanceSheetAt(model, monthIndex),
    cashFlow: cashFlowStatementAt(model, monthIndex),
    identity: checkIdentitiesAt(model, monthIndex),
    snapshot,
    facts: ledger.toJSON(),
  };
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const persisted = await loadOverrideMap();
  const body = await buildResponse(persisted, month);
  return Response.json(body);
}

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as { overrides?: OverrideMap; month?: string };
  const persisted = await loadOverrideMap();
  const merged = mergeOverrides(persisted, payload.overrides ?? {});
  const body = await buildResponse(merged, payload.month ?? null);
  return Response.json(body);
}
