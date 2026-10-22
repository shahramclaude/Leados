/**
 * Horizon-scanning signal contract (Part 13 sensing dependency).
 *
 * PROVENANCE NOTE: Part 13's actual sensing pipeline is not present in this
 * sandbox snapshot. This module declares the minimal signal shape Part 13
 * is described as emitting (a weak/strong signal with first-observed date
 * and source refs) and seeds a small illustrative set so Horizon Radar and
 * the foresight registry have real ingestion to show. Replace the seed feed
 * with the live Part 13 feed when that module is present in the repo.
 */
export interface HorizonSignal {
  id: string;
  title: string;
  description: string;
  category: "market" | "regulation" | "competition" | "technology" | "talent";
  firstObservedAt: string;
  /** 1 (negligible) – 5 (severe) if it materializes. */
  impact: 1 | 2 | 3 | 4 | 5;
  /** 1 (unlikely) – 5 (likely) — a rough band, not a precise probability. */
  likelihood: 1 | 2 | 3 | 4 | 5;
  /** 1 (well understood) – 5 (highly contested / wide disagreement). */
  uncertainty: 1 | 2 | 3 | 4 | 5;
  /** The evidence that would make us revise impact/likelihood materially. */
  whatWouldChangeOurMind: string;
  sourceRefs: string[];
}

export const SEED_HORIZON_SIGNALS: HorizonSignal[] = [
  {
    id: "sig-regulatory-ai-audit",
    title: "Mandatory third-party AI audit regime",
    description:
      "Several regulators are drafting rules requiring independent audits of AI-assisted decision systems before enterprise deployment.",
    category: "regulation",
    firstObservedAt: "2025-11-04T00:00:00.000Z",
    impact: 4,
    likelihood: 3,
    uncertainty: 4,
    whatWouldChangeOurMind:
      "A finalized statute with an effective date within 18 months, or two more jurisdictions tabling matching drafts.",
    sourceRefs: ["signal-intake-2025-11-04"],
  },
  {
    id: "sig-competitor-bundling",
    title: "Incumbent platform bundles a free foresight module",
    description:
      "A large adjacent vendor is piloting a bundled, free-tier scenario-planning feature inside its existing suite.",
    category: "competition",
    firstObservedAt: "2025-12-10T00:00:00.000Z",
    impact: 3,
    likelihood: 3,
    uncertainty: 3,
    whatWouldChangeOurMind: "General availability announcement, or three reference customers citing it as a switch reason.",
    sourceRefs: ["signal-intake-2025-12-10"],
  },
  {
    id: "sig-talent-tightening",
    title: "Specialist decision-science talent pool tightening",
    description: "Hiring signals show longer time-to-fill and rising comp for applied decision-science roles.",
    category: "talent",
    firstObservedAt: "2026-01-18T00:00:00.000Z",
    impact: 3,
    likelihood: 4,
    uncertainty: 2,
    whatWouldChangeOurMind: "Two consecutive quarters of falling median comp or shortening time-to-fill.",
    sourceRefs: ["signal-intake-2026-01-18"],
  },
  {
    id: "sig-macro-rate-shift",
    title: "Divergent central bank rate paths across core markets",
    description: "Core markets are no longer moving in rate lock-step, widening planning uncertainty for cross-border customers.",
    category: "market",
    firstObservedAt: "2026-02-02T00:00:00.000Z",
    impact: 3,
    likelihood: 3,
    uncertainty: 4,
    whatWouldChangeOurMind: "A coordinated rate statement, or a 100bp divergence sustained for two quarters.",
    sourceRefs: ["signal-intake-2026-02-02"],
  },
  {
    id: "sig-open-model-commoditization",
    title: "Open-weight model quality closing gap with frontier models",
    description: "Benchmark gap between leading open-weight models and closed frontier models is narrowing quarter over quarter.",
    category: "technology",
    firstObservedAt: "2026-02-20T00:00:00.000Z",
    impact: 4,
    likelihood: 4,
    uncertainty: 3,
    whatWouldChangeOurMind: "An open-weight model topping a reputable independent leaderboard for reasoning tasks.",
    sourceRefs: ["signal-intake-2026-02-20"],
  },
];
