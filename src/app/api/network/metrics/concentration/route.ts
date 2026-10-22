import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  concentrationSnapshots,
  ecosystemNodes,
  revenueRecords,
  skillCoverage,
  spendRecords,
} from "@/db/schema";
import { ecosystemEdges } from "@/db/schema";
import { herfindahlHirschmanIndex } from "@/lib/network/metrics";
import { evaluateConcentrationAlert } from "@/lib/network/alerts";
import { recordAlertIfNew } from "@/lib/network/alertStore";

export const dynamic = "force-dynamic";

type Dimension = "spend" | "revenue" | "skill" | "partner";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dimension = (searchParams.get("dimension") ?? "spend") as Dimension;
  const period = searchParams.get("period") ?? "2026-Q1";
  const capability = searchParams.get("capability") ?? undefined;

  const nodes = await db.select().from(ecosystemNodes);
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  let shares: { key: string; amount: number }[] = [];

  if (dimension === "spend") {
    const rows = await db.select().from(spendRecords).where(eq(spendRecords.period, period));
    const byPartner = new Map<string, number>();
    for (const r of rows) {
      byPartner.set(r.partnerNodeId, (byPartner.get(r.partnerNodeId) ?? 0) + Number(r.amount));
    }
    shares = [...byPartner.entries()].map(([key, amount]) => ({ key, amount }));
  } else if (dimension === "revenue") {
    const rows = await db.select().from(revenueRecords).where(eq(revenueRecords.period, period));
    const byCustomer = new Map<string, number>();
    for (const r of rows) {
      byCustomer.set(r.customerNodeId, (byCustomer.get(r.customerNodeId) ?? 0) + Number(r.amount));
    }
    shares = [...byCustomer.entries()].map(([key, amount]) => ({ key, amount }));
  } else if (dimension === "skill") {
    if (!capability) {
      return Response.json({ error: "capability query param required for dimension=skill" }, { status: 400 });
    }
    const rows = await db
      .select()
      .from(skillCoverage)
      .where(eq(skillCoverage.capability, capability));
    shares = rows.map((r) => ({ key: r.personId, amount: Number(r.capacity) }));
  } else if (dimension === "partner") {
    const rows = await db.select().from(ecosystemEdges).where(eq(ecosystemEdges.edgeType, "partners_with"));
    shares = rows.map((r) => ({ key: r.targetId, amount: Number(r.strength) }));
  } else {
    return Response.json({ error: `unknown dimension: ${dimension}` }, { status: 400 });
  }

  const hhi = herfindahlHirschmanIndex(shares);
  const namedShares = hhi.shares.map((s) => ({ ...s, name: nameOf(s.key) }));

  await db.insert(concentrationSnapshots).values({
    dimension,
    period,
    hhi: hhi.hhi.toString(),
    topShare: hhi.topShare.toString(),
  });

  const subjectRef = dimension === "skill" ? `skill:${capability}` : dimension;
  const alertDraft = evaluateConcentrationAlert(subjectRef, hhi);
  const alert = alertDraft ? await recordAlertIfNew(alertDraft) : null;

  const trend = await db
    .select()
    .from(concentrationSnapshots)
    .where(and(eq(concentrationSnapshots.dimension, dimension)))
    .orderBy(concentrationSnapshots.computedAt);

  return Response.json({
    dimension,
    period,
    capability: capability ?? null,
    hhi: hhi.hhi,
    topShare: hhi.topShare,
    band: hhi.band,
    shares: namedShares,
    alertFired: alert,
    trend: trend.map((t) => ({
      period: t.period,
      hhi: Number(t.hhi),
      topShare: Number(t.topShare),
      computedAt: t.computedAt,
    })),
  });
}
