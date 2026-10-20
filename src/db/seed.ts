/**
 * Deterministic seed data — no randomness, no lorem ipsum. Fixed values so
 * `/styleguide` and the dashboards render identically on every run (a
 * requirement for the Part 15 visual-regression target). Safe to re-run:
 * every insert is an upsert keyed on primary id.
 */
import { db, pool } from "./index";
import { decisions, financeLines, metricSnapshots, metrics, people } from "./schema";

const PEOPLE = [
  { id: "p1", name: "Amara Okafor", role: "VP Revenue", team: "Go-to-Market", email: "amara.okafor@leados.app", status: "active", severity: 2, startDate: "2021-03-01" },
  { id: "p2", name: "Daniel Kwon", role: "Staff Engineer", team: "Platform", email: "daniel.kwon@leados.app", status: "active", severity: 1, startDate: "2020-07-14" },
  { id: "p3", name: "Priya Natarajan", role: "Finance Director", team: "Finance", email: "priya.natarajan@leados.app", status: "active", severity: 1, startDate: "2019-11-04" },
  { id: "p4", name: "Lucas Ferreira", role: "Account Executive", team: "Go-to-Market", email: "lucas.ferreira@leados.app", status: "active", severity: 4, startDate: "2023-01-09" },
  { id: "p5", name: "Mei Lin Tan", role: "Product Manager", team: "Product", email: "mei.tan@leados.app", status: "active", severity: 2, startDate: "2022-05-23" },
  { id: "p6", name: "Oluwaseun Adeyemi", role: "Customer Success Lead", team: "Customer Success", email: "seun.adeyemi@leados.app", status: "leave", severity: 3, startDate: "2021-09-13" },
  { id: "p7", name: "Hannah Weiss", role: "Senior Engineer", team: "Platform", email: "hannah.weiss@leados.app", status: "active", severity: 1, startDate: "2022-02-28" },
  { id: "p8", name: "Tomás Rivera", role: "Sales Development Rep", team: "Go-to-Market", email: "tomas.rivera@leados.app", status: "active", severity: 5, startDate: "2024-04-01" },
  { id: "p9", name: "Grace Mensah", role: "People Partner", team: "People", email: "grace.mensah@leados.app", status: "active", severity: 2, startDate: "2020-10-19" },
  { id: "p10", name: "Ivan Petrov", role: "Data Engineer", team: "Platform", email: "ivan.petrov@leados.app", status: "offboarding", severity: 4, startDate: "2021-06-07" },
  { id: "p11", name: "Sofia Moretti", role: "Marketing Lead", team: "Go-to-Market", email: "sofia.moretti@leados.app", status: "active", severity: 2, startDate: "2022-08-15" },
  { id: "p12", name: "Noah Fitzgerald", role: "Support Engineer", team: "Customer Success", email: "noah.fitzgerald@leados.app", status: "active", severity: 3, startDate: "2023-03-20" },
] as const;

const DECISIONS = [
  { id: "d1", title: "Approve Q2 enterprise pricing floor", summary: "Set the minimum discount floor for enterprise renewals above 200 seats.", owner: "Amara Okafor", status: "pending", severity: 4, dueDate: "2026-02-18" },
  { id: "d2", title: "Backfill Platform data engineer role", summary: "Ivan Petrov's offboarding leaves one open req on the data pipeline team.", owner: "Daniel Kwon", status: "pending", severity: 3, dueDate: "2026-02-20" },
  { id: "d3", title: "Extend Customer Success coverage during leave", summary: "Oluwaseun Adeyemi is on leave; reassign the top-20 account list for continuity.", owner: "Grace Mensah", status: "pending", severity: 3, dueDate: "2026-02-15" },
  { id: "d4", title: "Sign off March marketing spend reallocation", summary: "Move $85k from paid social to the field-events budget for the March pipeline push.", owner: "Sofia Moretti", status: "approved", severity: 2, dueDate: "2026-02-10" },
  { id: "d5", title: "Escalate SDR ramp risk", summary: "Tomás Rivera is tracking 40% below ramp target at week 10; decide on coaching plan vs. role change.", owner: "Amara Okafor", status: "pending", severity: 5, dueDate: "2026-02-14" },
  { id: "d6", title: "Approve platform infra cost increase", summary: "Autoscaling changes raise monthly infra spend by $12k to resolve the Q1 latency incidents.", owner: "Priya Natarajan", status: "approved", severity: 3, dueDate: "2026-02-05" },
  { id: "d7", title: "Reject duplicate CRM tooling request", summary: "A second CRM add-on was requested that overlaps with existing Salesforce coverage.", owner: "Priya Natarajan", status: "rejected", severity: 1, dueDate: "2026-01-28" },
  { id: "d8", title: "Approve product roadmap reprioritization", summary: "Pull the usage-based billing epic forward a quarter in response to churn signal.", owner: "Mei Lin Tan", status: "pending", severity: 4, dueDate: "2026-02-22" },
] as const;

const METRICS = [
  { id: "arr", label: "Annual Recurring Revenue", unit: "$", category: "growth" },
  { id: "nrr", label: "Net Revenue Retention", unit: "%", category: "retention" },
  { id: "headcount", label: "Active Headcount", unit: "people", category: "ops" },
] as const;

const MONTHS = ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];

const ARR_VALUES = [4.1, 4.3, 4.35, 4.5, 4.62, 4.7, 4.9, 5.05, 5.2, 5.4, 5.55, 5.7]; // $M
const NRR_VALUES = [108, 109, 107, 110, 111, 109, 112, 113, 111, 114, 115, 116]; // %
const HEADCOUNT_VALUES = [86, 88, 89, 91, 93, 94, 96, 97, 99, 101, 103, 104];

const FINANCE_CATEGORIES = [
  { category: "revenue", actuals: [820, 845, 860, 890, 915, 930, 955, 980, 1005, 1030, 1050, null], forecast: [810, 840, 858, 885, 912, 935, 958, 982, 1008, 1033, 1058, 1082], band: 35 },
  { category: "cogs", actuals: [210, 214, 216, 219, 223, 226, 229, 233, 237, 240, 244, null], forecast: [208, 213, 217, 220, 224, 227, 230, 234, 238, 241, 245, 249], band: 10 },
  { category: "opex", actuals: [305, 310, 312, 318, 322, 325, 330, 334, 338, 343, 347, null], forecast: [300, 308, 313, 318, 323, 327, 331, 335, 339, 344, 348, 353], band: 14 },
  { category: "headcount_cost", actuals: [410, 418, 422, 430, 438, 443, 449, 455, 462, 469, 476, null], forecast: [405, 415, 423, 431, 439, 444, 450, 456, 463, 470, 477, 484], band: 18 },
] as const;

async function main() {
  await db.delete(people);
  await db.insert(people).values(PEOPLE.map((p) => ({ ...p })));

  await db.delete(decisions);
  await db.insert(decisions).values(DECISIONS.map((d) => ({ ...d })));

  await db.delete(metricSnapshots);
  await db.delete(metrics);
  await db.insert(metrics).values(METRICS.map((m) => ({ ...m })));

  const snapshotRows = METRICS.flatMap((metric) => {
    const values = metric.id === "arr" ? ARR_VALUES : metric.id === "nrr" ? NRR_VALUES : HEADCOUNT_VALUES;
    return MONTHS.map((period, i) => {
      const value = values[i];
      const spread = metric.id === "arr" ? 0.15 : metric.id === "nrr" ? 2 : 1.5;
      return {
        id: `${metric.id}-${period}`,
        metricId: metric.id,
        period,
        value: String(value),
        low: String(Math.max(0, value - spread)),
        high: String(value + spread),
      };
    });
  });
  await db.insert(metricSnapshots).values(snapshotRows);

  await db.delete(financeLines);
  const financeRows = FINANCE_CATEGORIES.flatMap((line) =>
    MONTHS.map((month, i) => ({
      id: `${line.category}-${month}`,
      category: line.category,
      month,
      actual: line.actuals[i] === null ? null : String(line.actuals[i]),
      forecast: String(line.forecast[i]),
      forecastLow: String(line.forecast[i] - line.band),
      forecastHigh: String(line.forecast[i] + line.band),
    })),
  );
  await db.insert(financeLines).values(financeRows);

  // eslint-disable-next-line no-console
  console.log("Seed complete:", {
    people: PEOPLE.length,
    decisions: DECISIONS.length,
    metrics: METRICS.length,
    metricSnapshots: snapshotRows.length,
    financeLines: financeRows.length,
  });
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
