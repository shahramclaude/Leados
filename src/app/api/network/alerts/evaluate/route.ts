// Runs every seeded threshold check in one pass: bus factor per capability,
// HHI concentration for spend/revenue/partner dimensions. Used by the
// "Run dependency checks" action in the Key-Dependency Alerts surface, and by
// the Phase 4 gate test that seeds a threshold breach and expects an alert.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { skillCoverage, spendRecords, revenueRecords, ecosystemEdges } from "@/db/schema";
import { busFactor, herfindahlHirschmanIndex } from "@/lib/network/metrics";
import { evaluateBusFactorAlert, evaluateConcentrationAlert } from "@/lib/network/alerts";
import { recordAlertIfNew } from "@/lib/network/alertStore";

export const dynamic = "force-dynamic";

export async function POST() {
  const fired: unknown[] = [];

  // Bus factor per capability (default threshold = 60% of total capacity).
  const coverageRows = await db.select().from(skillCoverage);
  const capabilities = [...new Set(coverageRows.map((r) => r.capability))];
  for (const capability of capabilities) {
    const rows = coverageRows.filter((r) => r.capability === capability);
    const total = rows.reduce((acc, r) => acc + Number(r.capacity), 0);
    const result = busFactor(
      capability,
      rows.map((r) => ({ personId: r.personId, capacity: Number(r.capacity), isPrimary: r.isPrimary })),
      total * 0.6,
    );
    const draft = evaluateBusFactorAlert(result);
    if (draft) fired.push(await recordAlertIfNew(draft));
  }

  // Spend concentration.
  const spend = await db.select().from(spendRecords);
  const periods = [...new Set(spend.map((s) => s.period))];
  for (const period of periods) {
    const byPartner = new Map<string, number>();
    for (const r of spend.filter((s) => s.period === period)) {
      byPartner.set(r.partnerNodeId, (byPartner.get(r.partnerNodeId) ?? 0) + Number(r.amount));
    }
    const hhi = herfindahlHirschmanIndex([...byPartner.entries()].map(([key, amount]) => ({ key, amount })));
    const draft = evaluateConcentrationAlert("spend", hhi);
    if (draft) fired.push(await recordAlertIfNew(draft));
  }

  // Revenue concentration.
  const revenue = await db.select().from(revenueRecords);
  const revPeriods = [...new Set(revenue.map((r) => r.period))];
  for (const period of revPeriods) {
    const byCustomer = new Map<string, number>();
    for (const r of revenue.filter((rr) => rr.period === period)) {
      byCustomer.set(r.customerNodeId, (byCustomer.get(r.customerNodeId) ?? 0) + Number(r.amount));
    }
    const hhi = herfindahlHirschmanIndex(
      [...byCustomer.entries()].map(([key, amount]) => ({ key, amount })),
    );
    const draft = evaluateConcentrationAlert("revenue", hhi);
    if (draft) fired.push(await recordAlertIfNew(draft));
  }

  // Partner relationship concentration (share of partners_with edge strength).
  const partnerEdges = await db
    .select()
    .from(ecosystemEdges)
    .where(eq(ecosystemEdges.edgeType, "partners_with"));
  const byPartnerStrength = new Map<string, number>();
  for (const e of partnerEdges) {
    byPartnerStrength.set(e.targetId, (byPartnerStrength.get(e.targetId) ?? 0) + Number(e.strength));
  }
  const partnerHhi = herfindahlHirschmanIndex(
    [...byPartnerStrength.entries()].map(([key, amount]) => ({ key, amount })),
  );
  const partnerDraft = evaluateConcentrationAlert("partner", partnerHhi);
  if (partnerDraft) fired.push(await recordAlertIfNew(partnerDraft));

  return Response.json({ evaluated: true, alertsFired: fired.length, alerts: fired });
}
