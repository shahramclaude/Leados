// src/lib/hypothesis.ts
// Lightweight hypothesis tracking (Part 2/3 prerequisite). Each hypothesis
// ties a belief-fabric latent node to a falsifiable prediction so the org
// can see what evidence would change the model's mind.
//
// Exported: Hypothesis (interface, line 15), DEFAULT_HYPOTHESES (const, line 24),
//           getActiveHypotheses (function, line 40)

export interface Hypothesis {
  id: string;
  nodeId: string;
  statement: string;
  confidence: number;
  status: 'open' | 'confirmed' | 'rejected';
  evidenceNeeded: string;
}

export const DEFAULT_HYPOTHESES: Hypothesis[] = [
  {
    id: 'h_churn_competitive',
    nodeId: 'competitive_pressure',
    statement: 'Elevated churn is competitor-driven rather than product-driven.',
    confidence: 0.55,
    status: 'open',
    evidenceNeeded: 'win/loss interviews tagged with a named competitor',
  },
  {
    id: 'h_morale_attrition',
    nodeId: 'team_morale',
    statement: 'Recent attrition reflects compensation gaps, not culture/strategy concerns.',
    confidence: 0.48,
    status: 'open',
    evidenceNeeded: 'structured exit interview data',
  },
  {
    id: 'h_runway_recoverable',
    nodeId: 'capital_runway',
    statement: 'Runway compression can be reversed by Q+1 via burn reduction alone, without a raise.',
    confidence: 0.6,
    status: 'open',
    evidenceNeeded: 'updated cohort-level unit economics',
  },
];

export function getActiveHypotheses(): Hypothesis[] {
  return DEFAULT_HYPOTHESES.filter((h) => h.status === 'open');
}
