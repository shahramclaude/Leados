/**
 * Hypothesis registry contract (Part 12 dependency).
 *
 * PROVENANCE NOTE: Part 12's hypothesis registry is not present in this
 * sandbox snapshot. This module declares the minimal shape this part needs
 * to link foresight claims to registered hypotheses (an id, a statement,
 * and a registered timestamp) and seeds a few illustrative entries.
 * Replace with the live Part 12 registry import when available.
 */
export interface RegisteredHypothesis {
  id: string;
  statement: string;
  registeredAt: string;
  owner: string;
}

export const SEED_HYPOTHESES: RegisteredHypothesis[] = [
  {
    id: "hyp-12-003",
    statement: "Regulatory audit requirements will raise our enterprise sales cycle by at least 20% within 12 months.",
    registeredAt: "2025-11-06T09:00:00.000Z",
    owner: "strategy-desk",
  },
  {
    id: "hyp-12-011",
    statement: "A bundled free-tier competitor offering will compress our win rate in the mid-market segment.",
    registeredAt: "2025-12-12T09:00:00.000Z",
    owner: "strategy-desk",
  },
  {
    id: "hyp-12-017",
    statement: "Open-weight model commoditization will shift competitive advantage toward workflow/data moat, not model quality.",
    registeredAt: "2026-02-22T09:00:00.000Z",
    owner: "strategy-desk",
  },
];
