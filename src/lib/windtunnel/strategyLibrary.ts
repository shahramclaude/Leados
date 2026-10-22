import { explain } from "../core/explain";
import type { Strategy } from "./types";

export const SEED_STRATEGIES: Strategy[] = [
  {
    id: "strat-land-expand",
    name: "Land-and-Expand Growth",
    description: explain(
      "Push revenue growth and market share aggressively; accept faster cash burn.",
      "Candidate strategy authored for wind-tunnel testing against the 5-scenario ensemble.",
      "moderate",
      "strategy-desk",
      undefined,
      "2026-03-06T09:00:00.000Z"
    ),
    twinDeltas: { revenueGrowth: 0.012, cashRunwayMonths: -0.25, marketShare: 0.003 },
  },
  {
    id: "strat-compliance-resilience",
    name: "Compliance & Balance-Sheet Resilience",
    description: explain(
      "Invest in audit-readiness and preserve cash runway ahead of possible regulatory shocks, trading off some growth.",
      "Candidate strategy authored for wind-tunnel testing against the 5-scenario ensemble.",
      "moderate",
      "strategy-desk",
      ["sig-regulatory-ai-audit", "hyp-12-003"],
      "2026-03-06T09:01:00.000Z"
    ),
    twinDeltas: { cashRunwayMonths: 0.15, revenueGrowth: -0.004, churnRate: -0.003 },
  },
  {
    id: "strat-workflow-lockin",
    name: "Workflow Lock-in & Retention",
    description: explain(
      "Deepen integration and data moat to defend against commoditization and bundler competition via retention.",
      "Candidate strategy authored for wind-tunnel testing against the 5-scenario ensemble.",
      "moderate",
      "strategy-desk",
      ["sig-open-model-commoditization", "sig-competitor-bundling"],
      "2026-03-06T09:02:00.000Z"
    ),
    twinDeltas: { churnRate: -0.01, marketShare: 0.002, cashRunwayMonths: -0.05 },
  },
];
