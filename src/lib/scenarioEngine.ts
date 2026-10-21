// E. Scenario studio — wires scenario specs into the financial model and OKRs.
// A scenario is a named set of driver deltas (fractional shifts applied on top
// of the base-case assumption) plus a probability and a list of early-warning
// indicators that should be watched for it to be "becoming real".
import { db } from "@/db";
import { scenarios, indicators } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { num, round2 } from "@/lib/format";
import { assumptionsAsMap } from "@/lib/assumptions";
import { projectMonths, derivedHistoricalPnL, derivedHeadcountByMonth, cashBalanceThroughMonth } from "@/lib/financialOS";

export async function listScenarios() {
  return db.select().from(scenarios);
}

export async function getScenario(id: number) {
  const [row] = await db.select().from(scenarios).where(eq(scenarios.id, id));
  return row ?? null;
}

async function anchorForScenarios() {
  const derived = await derivedHistoricalPnL();
  const months = [...new Set(derived.map((d) => d.month))].sort();
  const month = months[months.length - 1];
  const headcountByMonth = await derivedHeadcountByMonth();
  const sum = (cat: string) => derived.filter((d) => d.month === month && d.category === cat).reduce((a, b) => a + b.amount, 0);
  const cash = await cashBalanceThroughMonth(month);
  return {
    month,
    revenue: sum("revenue"),
    cogs: sum("cogs"),
    salaries: sum("salaries"),
    opexOther: sum("opex_other"),
    cash,
    headcount: headcountByMonth[month] ?? 0,
    unitPrice: 1,
    units: sum("revenue") || 1,
  };
}

/** Applies a scenario's driver deltas on top of base-case assumptions and reprojects. */
export async function applyScenario(scenarioId: number, monthsAhead = 12) {
  const scenario = await getScenario(scenarioId);
  if (!scenario) return null;
  const a = await assumptionsAsMap();
  const deltas = scenario.driverDeltas as Record<string, number>;
  const anchor = await anchorForScenarios();

  const drivers: Record<string, number> = {};
  for (const key of Object.keys(a)) {
    const base = a[key].base;
    const delta = deltas[key] ?? 0;
    drivers[key] = round2(base * (1 + delta));
  }

  const months = projectMonths(anchor, drivers, monthsAhead);
  return { scenario, months, driversUsed: drivers };
}

/** Diff two or more scenarios (and the unmodified base case) month by month for the studio UI. */
export async function diffScenarios(scenarioIds: number[], monthsAhead = 12) {
  const a = await assumptionsAsMap();
  const anchor = await anchorForScenarios();
  const baseDrivers: Record<string, number> = {};
  for (const key of Object.keys(a)) baseDrivers[key] = a[key].base;
  const base = { label: "Base case", months: projectMonths(anchor, baseDrivers, monthsAhead) };

  const applied = await Promise.all(scenarioIds.map((id) => applyScenario(id, monthsAhead)));
  const series = applied
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ label: r.scenario.title, scenarioId: r.scenario.id, probability: num(r.scenario.probability), months: r.months }));

  return { base, scenarios: series };
}

export async function earlyWarningForScenario(scenarioId: number) {
  const scenario = await getScenario(scenarioId);
  if (!scenario) return [];
  const ids = (scenario.earlyWarningIndicatorIds as number[]) ?? [];
  if (ids.length === 0) return [];
  return db.select().from(indicators).where(inArray(indicators.id, ids));
}
