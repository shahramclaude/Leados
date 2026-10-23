import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { industryMetricSnapshots, industrySegments } from "@/db/schema";
import { computeHHI, classifyHHIBand, computeEntryExitFlow, detectCapacityCycle } from "@/lib/industry/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segmentId");

  const rows = await db
    .select()
    .from(industryMetricSnapshots)
    .where(segmentId ? eq(industryMetricSnapshots.segmentId, Number(segmentId)) : undefined)
    .orderBy(desc(industryMetricSnapshots.period));

  return Response.json({ snapshots: rows });
}

/**
 * Recompute a snapshot from raw inputs using the fixture-tested pure
 * functions in src/lib/industry/metrics.ts. Demonstrates the pipeline:
 * raw external inputs -> computed metrics -> stored snapshot, carrying an
 * explicit evidence class and source reference.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const {
    segmentId,
    period,
    marketShares, // number[] fractions summing to ~1
    priorFirmCount,
    entrants,
    exits,
    utilizationSeries, // number[] 0..1, chronological
    priceIndex,
    evidenceClass = "model_estimate",
    sourceRef = null,
  } = body ?? {};

  if (!segmentId || !period || !Array.isArray(marketShares)) {
    return Response.json({ error: "segmentId, period, and marketShares[] are required" }, { status: 400 });
  }

  const segment = await db.select().from(industrySegments).where(eq(industrySegments.id, segmentId)).limit(1);
  if (segment.length === 0) {
    return Response.json({ error: `segment ${segmentId} not found` }, { status: 404 });
  }

  const hhi = computeHHI(marketShares);
  const hhiBand = classifyHHIBand(hhi);
  const flow = computeEntryExitFlow(Number(entrants ?? 0), Number(exits ?? 0), Number(priorFirmCount ?? marketShares.length));
  const cycle = Array.isArray(utilizationSeries) ? detectCapacityCycle(utilizationSeries) : { phase: null, confidence: 0 };

  const [row] = await db
    .insert(industryMetricSnapshots)
    .values({
      segmentId,
      period,
      hhi,
      hhiBand,
      firmCount: Number(priorFirmCount ?? marketShares.length) + flow.entrants - flow.exits,
      entrants: flow.entrants,
      exits: flow.exits,
      netEntryRate: flow.netEntryRate,
      capacityUtilization: Array.isArray(utilizationSeries) ? utilizationSeries[utilizationSeries.length - 1] : null,
      priceIndex: typeof priceIndex === "number" ? priceIndex : null,
      cyclePhase: cycle.phase,
      cycleConfidence: cycle.confidence,
      evidenceClass,
      sourceRef,
    })
    .onConflictDoUpdate({
      target: [industryMetricSnapshots.segmentId, industryMetricSnapshots.period],
      set: {
        hhi,
        hhiBand,
        entrants: flow.entrants,
        exits: flow.exits,
        netEntryRate: flow.netEntryRate,
        cyclePhase: cycle.phase,
        cycleConfidence: cycle.confidence,
        evidenceClass,
        sourceRef,
      },
    })
    .returning();

  return Response.json({ snapshot: row });
}
