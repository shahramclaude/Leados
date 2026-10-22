// Part 08 — shapes the evaluated DAG into P&L / Balance Sheet / Cash Flow
// statements for a given month, plus the identity checks that the
// reconciliation test suite asserts on every seeded scenario.

import { EvaluatedModel } from "./dag";

export interface IncomeStatement {
  month: string;
  revenueCore: number;
  revenueServices: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;
  totalSm: number;
  totalRnd: number;
  totalGa: number;
  totalOpex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  taxExpense: number;
  netIncome: number;
}

export interface BalanceSheet {
  month: string;
  cash: number;
  ar: number;
  ppe: number;
  totalAssets: number;
  ap: number;
  totalLiabilities: number;
  paidInCapital: number;
  retainedEarnings: number;
  totalEquity: number;
  balanceCheck: number;
}

export interface CashFlowStatement {
  month: string;
  cfo: number;
  cfi: number;
  cff: number;
  netChangeInCash: number;
  reportedEndingCash: number;
  reconciliationDelta: number;
}

function v(model: EvaluatedModel, id: string, i: number): number {
  const node = model.nodes[id];
  if (!node) throw new Error(`financialStatements: missing node "${id}"`);
  return node.values[i];
}

export function incomeStatementAt(model: EvaluatedModel, i: number): IncomeStatement {
  return {
    month: model.months[i],
    revenueCore: v(model, "revenueCore", i),
    revenueServices: v(model, "revenueServices", i),
    totalRevenue: v(model, "totalRevenue", i),
    totalCogs: v(model, "totalCogs", i),
    grossProfit: v(model, "grossProfit", i),
    grossMargin: v(model, "grossMargin", i),
    totalSm: v(model, "totalSm", i),
    totalRnd: v(model, "rndHeadcountAmount", i),
    totalGa: v(model, "totalGa", i),
    totalOpex: v(model, "totalOpex", i),
    ebitda: v(model, "ebitda", i),
    depreciation: v(model, "depreciation", i),
    ebit: v(model, "ebit", i),
    taxExpense: v(model, "taxExpense", i),
    netIncome: v(model, "netIncome", i),
  };
}

export function balanceSheetAt(model: EvaluatedModel, i: number): BalanceSheet {
  return {
    month: model.months[i],
    cash: v(model, "cashBalance", i),
    ar: v(model, "arBalance", i),
    ppe: v(model, "ppeBalance", i),
    totalAssets: v(model, "totalAssets", i),
    ap: v(model, "apBalance", i),
    totalLiabilities: v(model, "totalLiabilities", i),
    paidInCapital: v(model, "paidInCapital", i),
    retainedEarnings: v(model, "retainedEarnings", i),
    totalEquity: v(model, "totalEquity", i),
    balanceCheck: v(model, "balanceCheck", i),
  };
}

export function cashFlowStatementAt(model: EvaluatedModel, i: number): CashFlowStatement {
  const cfo = v(model, "cfo", i);
  const cfi = v(model, "cfi", i);
  const cff = v(model, "cff", i);
  const netChangeInCash = cfo + cfi + cff;
  const cash = model.nodes["cashBalance"].values;
  const startingCash = model.nodes["startingCash"].values[0];
  const priorCash = i === 0 ? startingCash : cash[i - 1];
  const reportedEndingCash = cash[i];
  const reconciliationDelta = reportedEndingCash - (priorCash + netChangeInCash);
  return { month: model.months[i], cfo, cfi, cff, netChangeInCash, reportedEndingCash, reconciliationDelta };
}

export interface IdentityCheckResult {
  month: string;
  balanceSheetDelta: number;
  cashReconciliationDelta: number;
  marginIdentityDelta: number; // grossProfit - (revenue - cogs)
  ok: boolean;
}

const TOLERANCE_CENTS = 0.01;

export function checkIdentitiesAt(model: EvaluatedModel, i: number): IdentityCheckResult {
  const bs = balanceSheetAt(model, i);
  const cf = cashFlowStatementAt(model, i);
  const is = incomeStatementAt(model, i);
  const marginIdentityDelta = is.grossProfit - (is.totalRevenue - is.totalCogs);
  const ok =
    Math.abs(bs.balanceCheck) <= TOLERANCE_CENTS &&
    Math.abs(cf.reconciliationDelta) <= TOLERANCE_CENTS &&
    Math.abs(marginIdentityDelta) <= TOLERANCE_CENTS;
  return {
    month: model.months[i],
    balanceSheetDelta: bs.balanceCheck,
    cashReconciliationDelta: cf.reconciliationDelta,
    marginIdentityDelta,
    ok,
  };
}

export function checkAllIdentities(model: EvaluatedModel): IdentityCheckResult[] {
  return model.months.map((_, i) => checkIdentitiesAt(model, i));
}
