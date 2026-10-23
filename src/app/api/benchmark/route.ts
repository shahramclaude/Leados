import { db } from "@/db";
import { benchmarkMetrics, orgProfiles, peerGroups } from "@/db/schema";
import { constructPeerGroup, computePercentile, type OrgFeatureVector } from "@/lib/benchmark/peers";

export const dynamic = "force-dynamic";

type OrgRow = typeof orgProfiles.$inferSelect;

const SUPPORTED_METRICS = ["revenueUsd", "headcount", "growthRateYoy", "grossMarginPct"] as const;
type MetricName = (typeof SUPPORTED_METRICS)[number];

function metricValue(org: OrgRow, metric: MetricName): number {
  switch (metric) {
    case "revenueUsd":
      return Number(org.revenueUsd ?? 0);
    case "headcount":
      return org.headcount ?? 0;
    case "growthRateYoy":
      return org.growthRateYoy ?? 0;
    case "grossMarginPct":
      return org.grossMarginPct ?? 0;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = Number(searchParams.get("orgId"));
  const metricParam = searchParams.get("metric") ?? "growthRateYoy";
  const k = Number(searchParams.get("k") ?? 5);

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }
  if (!SUPPORTED_METRICS.includes(metricParam as MetricName)) {
    return Response.json({ error: `unsupported metric ${metricParam}` }, { status: 400 });
  }
  const metric = metricParam as MetricName;

  const all = await db.select().from(orgProfiles);
  const target = all.find((o) => o.id === orgId);
  if (!target) {
    return Response.json({ error: `org ${orgId} not found` }, { status: 404 });
  }

  const vectors: OrgFeatureVector[] = all.map((o) => ({
    orgId: o.id,
    name: o.name,
    isSelf: o.isSelf,
    features: {
      revenueUsd: Number(o.revenueUsd ?? 0),
      headcount: o.headcount ?? 0,
      growthRateYoy: o.growthRateYoy ?? 0,
      grossMarginPct: o.grossMarginPct ?? 0,
    },
  }));

  const weightsParam = searchParams.get("weights");
  const featureWeights = weightsParam ? (JSON.parse(weightsParam) as Record<string, number>) : undefined;

  const peerResult = constructPeerGroup(vectors, orgId, { k, featureWeights });

  const peerRows = all.filter((o) => peerResult.peerOrgIds.includes(o.id));
  const distribution = peerRows.map((o) => metricValue(o, metric));
  const targetValue = metricValue(target, metric);

  const pct = computePercentile(targetValue, distribution);

  const [savedGroup] = await db
    .insert(peerGroups)
    .values({
      targetOrgId: orgId,
      method: peerResult.method,
      featureWeights: peerResult.featureWeights,
      k: peerResult.k,
      peerOrgIds: peerResult.peerOrgIds,
      rationale: peerResult.rationale,
    })
    .returning();

  const [savedMetric] = await db
    .insert(benchmarkMetrics)
    .values({
      orgId,
      peerGroupId: savedGroup.id,
      metricName: metric,
      orgValue: targetValue,
      percentile: pct.percentile,
      sampleSize: pct.sampleSize,
      methodBadge: pct.methodBadge,
      lowSample: pct.lowSample,
      evidenceClass: "model_estimate",
    })
    .returning();

  return Response.json({
    target: { id: target.id, name: target.name },
    metric,
    peerGroup: { ...peerResult, peers: peerRows.map((p) => ({ id: p.id, name: p.name })) },
    benchmark: savedMetric,
  });
}
