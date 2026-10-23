// Seed fixture data for Part 50 — Industry Intelligence, Contagion &
// Benchmarking. Run with: npm run db:seed
//
// Data here is clearly synthetic/demo and labeled with explicit evidence
// classes so nobody mistakes it for real market intelligence. Source refs
// are plausible-looking but fictional placeholders (e.g. "Demo-Registry-001").

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import {
  benchmarkMetrics,
  contagionScenarios,
  externalSignals,
  externalSources,
  industryMetricSnapshots,
  industrySegments,
  orgProfiles,
  peerGroups,
  valueChainEdges,
  valueChainNodes,
} from "./schema";
import { scoreSignal } from "@/lib/radar/signals";
import { constructPeerGroup, computePercentile } from "@/lib/benchmark/peers";
import { crisisElevations } from "./schema";

async function main() {
  console.log("Seeding Part 50 fixture data...");

  // --- Industry segment -----------------------------------------------
  const [segment] = await db
    .insert(industrySegments)
    .values({
      name: "Mid-Market B2B SaaS — Data Infrastructure",
      naicsCode: "511210",
      description: "Demo industry segment used to exercise Part 50's industry intelligence features.",
    })
    .returning();

  await db.insert(industryMetricSnapshots).values([
    {
      segmentId: segment.id,
      period: "2025-Q3",
      hhi: 1180,
      hhiBand: "unconcentrated",
      firmCount: 142,
      entrants: 9,
      exits: 5,
      netEntryRate: 4 / 138,
      capacityUtilization: 0.78,
      priceIndex: 101.2,
      cyclePhase: "expansion",
      cycleConfidence: 0.58,
      evidenceClass: "licensed_dataset",
      sourceRef: "Demo-Licensed-MarketData-2025Q3",
    },
    {
      segmentId: segment.id,
      period: "2025-Q4",
      hhi: 1240,
      hhiBand: "unconcentrated",
      firmCount: 146,
      entrants: 7,
      exits: 6,
      netEntryRate: 1 / 142,
      capacityUtilization: 0.83,
      priceIndex: 103.4,
      cyclePhase: "peak",
      cycleConfidence: 0.52,
      evidenceClass: "licensed_dataset",
      sourceRef: "Demo-Licensed-MarketData-2025Q4",
    },
    {
      segmentId: segment.id,
      period: "2026-Q1",
      hhi: 1310,
      hhiBand: "unconcentrated",
      firmCount: 149,
      entrants: 5,
      exits: 9,
      netEntryRate: -4 / 146,
      capacityUtilization: 0.74,
      priceIndex: 102.1,
      cyclePhase: "contraction",
      cycleConfidence: 0.61,
      evidenceClass: "licensed_dataset",
      sourceRef: "Demo-Licensed-MarketData-2026Q1",
    },
  ]);

  // --- Value chain: self + tier1 (direct partners) + tier2/3 (extended) --
  const [self] = await db
    .insert(valueChainNodes)
    .values({
      segmentId: segment.id,
      name: "LEADOS Subject Org",
      tier: "self",
      role: "self",
      revenueWeight: 1,
      dataConfidence: 1,
      isGapFilled: false,
      evidenceClass: "internal_telemetry",
    })
    .returning();

  const tier1 = await db
    .insert(valueChainNodes)
    .values([
      {
        segmentId: segment.id,
        name: "Primary Cloud Infrastructure Provider",
        tier: "tier1",
        role: "supplier",
        revenueWeight: 0.9,
        dataConfidence: 0.95,
        isGapFilled: false,
        evidenceClass: "verified_primary",
      },
      {
        segmentId: segment.id,
        name: "Payment Processing Partner",
        tier: "tier1",
        role: "supplier",
        revenueWeight: 0.6,
        dataConfidence: 0.9,
        isGapFilled: false,
        evidenceClass: "verified_primary",
      },
      {
        segmentId: segment.id,
        name: "Key Enterprise Customer Cohort",
        tier: "tier1",
        role: "customer",
        revenueWeight: 0.8,
        dataConfidence: 0.85,
        isGapFilled: false,
        evidenceClass: "reported_secondary",
      },
      {
        segmentId: segment.id,
        name: "Channel Reseller Network",
        tier: "tier1",
        role: "partner",
        revenueWeight: 0.4,
        dataConfidence: 0.7,
        isGapFilled: false,
        evidenceClass: "reported_secondary",
      },
    ])
    .returning();

  const [cloudProvider, paymentPartner, enterpriseCustomers, resellerNetwork] = tier1;

  const tier2 = await db
    .insert(valueChainNodes)
    .values([
      {
        segmentId: segment.id,
        name: "Core Database Engine Vendor",
        tier: "tier2",
        role: "supplier",
        revenueWeight: 0.5,
        dataConfidence: 0.6,
        isGapFilled: false,
        evidenceClass: "reported_secondary",
      },
      {
        segmentId: segment.id,
        name: "KYC / Identity Data Vendor",
        tier: "tier2",
        role: "supplier",
        revenueWeight: 0.3,
        dataConfidence: 0.5,
        isGapFilled: true,
        evidenceClass: "unverified_signal",
      },
    ])
    .returning();

  const [dbVendor, kycVendor] = tier2;

  const tier3 = await db
    .insert(valueChainNodes)
    .values([
      {
        segmentId: segment.id,
        name: "Semiconductor Foundry (inferred, unconfirmed)",
        tier: "tier3",
        role: "supplier",
        revenueWeight: 0.2,
        dataConfidence: 0.2,
        isGapFilled: true,
        evidenceClass: "unverified_signal",
      },
    ])
    .returning();

  const [foundry] = tier3;

  await db.insert(valueChainEdges).values([
    {
      fromNodeId: cloudProvider.id,
      toNodeId: self.id,
      relationship: "supplies",
      dependencyWeight: 0.8,
      correlatedShockGroup: "single-cloud-region-us-east",
      evidenceClass: "verified_primary",
      isGapFilled: false,
    },
    {
      fromNodeId: paymentPartner.id,
      toNodeId: self.id,
      relationship: "supplies",
      dependencyWeight: 0.5,
      correlatedShockGroup: null,
      evidenceClass: "verified_primary",
      isGapFilled: false,
    },
    {
      fromNodeId: self.id,
      toNodeId: enterpriseCustomers.id,
      relationship: "supplies",
      dependencyWeight: 0.6,
      correlatedShockGroup: "macro-demand",
      evidenceClass: "reported_secondary",
      isGapFilled: false,
    },
    {
      fromNodeId: self.id,
      toNodeId: resellerNetwork.id,
      relationship: "supplies",
      dependencyWeight: 0.3,
      correlatedShockGroup: null,
      evidenceClass: "reported_secondary",
      isGapFilled: false,
    },
    {
      fromNodeId: dbVendor.id,
      toNodeId: cloudProvider.id,
      relationship: "supplies",
      dependencyWeight: 0.4,
      correlatedShockGroup: "single-cloud-region-us-east",
      evidenceClass: "reported_secondary",
      isGapFilled: false,
    },
    {
      fromNodeId: kycVendor.id,
      toNodeId: paymentPartner.id,
      relationship: "supplies",
      dependencyWeight: 0.35,
      correlatedShockGroup: "regulatory-kyc-regime",
      evidenceClass: "unverified_signal",
      isGapFilled: true,
    },
    {
      fromNodeId: foundry.id,
      toNodeId: dbVendor.id,
      relationship: "supplies",
      dependencyWeight: 0.25,
      correlatedShockGroup: null,
      evidenceClass: "unverified_signal",
      isGapFilled: true,
    },
  ]);

  // --- Contagion scenarios ------------------------------------------------
  await db.insert(contagionScenarios).values([
    {
      segmentId: segment.id,
      name: "Primary Cloud Provider Outage/Failure",
      type: "supplier_failure",
      description:
        "Models a sustained failure at the primary cloud infrastructure provider cascading through dependent nodes.",
      seedNodeIds: [cloudProvider.id],
      defaultParams: { baseProbabilityMultiplier: 1, correlatedShockFactor: 0.15, trials: 500 },
    },
    {
      segmentId: segment.id,
      name: "Enterprise Customer Demand Shock",
      type: "demand_shock",
      description: "Models a sharp pullback in enterprise customer spend propagating upstream to suppliers/partners.",
      seedNodeIds: [enterpriseCustomers.id],
      defaultParams: { baseProbabilityMultiplier: 0.8, correlatedShockFactor: 0.35, trials: 500 },
    },
    {
      segmentId: segment.id,
      name: "KYC Regulatory Regime Shock",
      type: "regulatory_shock",
      description:
        "Models a regulatory action affecting KYC/identity data vendors, correlated across the regulatory-kyc-regime group.",
      seedNodeIds: [kycVendor.id],
      defaultParams: { baseProbabilityMultiplier: 0.6, correlatedShockFactor: 0.55, trials: 500 },
    },
  ]);

  // --- External sources & signals -----------------------------------------
  const sources = await db
    .insert(externalSources)
    .values([
      {
        name: "Demo Financial Registry",
        sourceType: "registry",
        reliabilityScore: 0.92,
        reliabilityClass: "tier1_verified",
        lastValidatedAt: new Date(),
      },
      {
        name: "Demo Trade Press",
        sourceType: "news",
        reliabilityScore: 0.55,
        reliabilityClass: "tier2_reported",
        lastValidatedAt: new Date(),
      },
      {
        name: "Demo Anonymous Forum Aggregator",
        sourceType: "news",
        reliabilityScore: 0.2,
        reliabilityClass: "tier3_unverified",
        lastValidatedAt: new Date(),
      },
    ])
    .returning();

  const [registry, tradePress, forum] = sources;

  const rawSignals = [
    {
      source: registry,
      title: "Payment Processing Partner files regulatory capital notice",
      summary:
        "Demo registry filing indicates a capital adequacy notice was filed by the payment processing partner's parent entity.",
      signalType: "regulatory_action",
      severityHint: "high" as const,
      publishedAt: new Date("2026-01-14"),
    },
    {
      source: tradePress,
      title: "Trade press reports consolidation rumor among data infra vendors",
      summary: "Unconfirmed trade-press report of acquisition talks among two tier-2 database vendors.",
      signalType: "ma_rumor",
      severityHint: "moderate" as const,
      publishedAt: new Date("2026-02-02"),
    },
    {
      source: forum,
      title: "Forum chatter alleges cloud provider outage in us-east region",
      summary: "Unverified forum posts allege an extended outage; no corroboration from primary sources yet.",
      signalType: "outage_rumor",
      severityHint: "critical" as const,
      publishedAt: new Date("2026-02-10"),
    },
  ];

  for (const raw of rawSignals) {
    const scored = scoreSignal(
      {
        sourceName: raw.source.name,
        sourceType: raw.source.sourceType as "news" | "registry" | "licensed_dataset" | "regulator",
        title: raw.title,
        summary: raw.summary,
        signalType: raw.signalType,
        severityHint: raw.severityHint,
        publishedAt: raw.publishedAt.toISOString(),
      },
      raw.source.reliabilityScore,
    );

    const [inserted] = await db
      .insert(externalSignals)
      .values({
        sourceId: raw.source.id,
        segmentId: segment.id,
        title: scored.title,
        summary: scored.summary,
        signalType: scored.signalType,
        severity: scored.severity,
        evidenceClass: scored.evidenceClass,
        publishedAt: raw.publishedAt,
        escalated: scored.elevation.elevate,
      })
      .returning();

    if (scored.elevation.elevate) {
      const [elevation] = await db
        .insert(crisisElevations)
        .values({
          signalId: inserted.id,
          reason: scored.elevation.reason,
          thresholdBreached: scored.elevation.thresholdBreached,
        })
        .returning();
      await db
        .update(externalSignals)
        .set({ escalationRef: elevation.id })
        .where(eq(externalSignals.id, inserted.id));
    }
  }

  // --- Benchmarking: self org + peer population ---------------------------
  const [selfOrg] = await db
    .insert(orgProfiles)
    .values({
      name: "LEADOS Subject Org",
      segmentId: segment.id,
      isSelf: true,
      revenueUsd: "42000000",
      headcount: 210,
      growthRateYoy: 0.22,
      grossMarginPct: 0.71,
      evidenceClass: "internal_telemetry",
    })
    .returning();

  const peerSeed = [
    { name: "Peer A", revenueUsd: 38000000, headcount: 190, growth: 0.18, margin: 0.68 },
    { name: "Peer B", revenueUsd: 55000000, headcount: 260, growth: 0.15, margin: 0.73 },
    { name: "Peer C", revenueUsd: 29000000, headcount: 150, growth: 0.3, margin: 0.65 },
    { name: "Peer D", revenueUsd: 61000000, headcount: 310, growth: 0.1, margin: 0.75 },
    { name: "Peer E", revenueUsd: 33000000, headcount: 175, growth: 0.25, margin: 0.69 },
    { name: "Peer F", revenueUsd: 47000000, headcount: 225, growth: 0.2, margin: 0.7 },
    { name: "Peer G", revenueUsd: 22000000, headcount: 120, growth: 0.35, margin: 0.6 },
    { name: "Peer H", revenueUsd: 70000000, headcount: 340, growth: 0.08, margin: 0.78 },
  ];

  const peerOrgs = await db
    .insert(orgProfiles)
    .values(
      peerSeed.map((p) => ({
        name: p.name,
        segmentId: segment.id,
        isSelf: false,
        revenueUsd: String(p.revenueUsd),
        headcount: p.headcount,
        growthRateYoy: p.growth,
        grossMarginPct: p.margin,
        evidenceClass: "reported_secondary" as const,
      })),
    )
    .returning();

  const allOrgs = [selfOrg, ...peerOrgs].map((o) => ({
    orgId: o.id,
    name: o.name,
    isSelf: o.isSelf,
    features: {
      revenueUsd: Number(o.revenueUsd),
      headcount: o.headcount ?? 0,
      growthRateYoy: o.growthRateYoy ?? 0,
      grossMarginPct: o.grossMarginPct ?? 0,
    },
  }));

  const peerGroupResult = constructPeerGroup(allOrgs, selfOrg.id, { k: 5 });
  const [peerGroupRow] = await db
    .insert(peerGroups)
    .values({
      targetOrgId: selfOrg.id,
      method: peerGroupResult.method,
      featureWeights: peerGroupResult.featureWeights,
      k: peerGroupResult.k,
      peerOrgIds: peerGroupResult.peerOrgIds,
      rationale: peerGroupResult.rationale,
    })
    .returning();

  const peerDistribution = peerOrgs
    .filter((p) => peerGroupResult.peerOrgIds.includes(p.id))
    .map((p) => p.growthRateYoy ?? 0);
  const pct = computePercentile(selfOrg.growthRateYoy ?? 0, peerDistribution);

  await db.insert(benchmarkMetrics).values({
    orgId: selfOrg.id,
    peerGroupId: peerGroupRow.id,
    metricName: "growthRateYoy",
    orgValue: selfOrg.growthRateYoy ?? 0,
    percentile: pct.percentile,
    sampleSize: pct.sampleSize,
    methodBadge: pct.methodBadge,
    lowSample: pct.lowSample,
    evidenceClass: "model_estimate",
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
