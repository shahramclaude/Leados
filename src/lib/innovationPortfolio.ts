// src/lib/innovationPortfolio.ts
// Minimal innovation-bet portfolio tracker (Part 2/3 prerequisite).
//
// Exported: InnovationBet (interface, line 11), DEFAULT_PORTFOLIO (const, line 19),
//           portfolioRiskBalance (function, line 30)

export interface InnovationBet {
  id: string;
  name: string;
  horizon: 'core' | 'adjacent' | 'transformational';
  stage: 'exploring' | 'piloting' | 'scaling';
  confidence: number;
}

export const DEFAULT_PORTFOLIO: InnovationBet[] = [
  { id: 'b1', name: 'Self-serve onboarding flow', horizon: 'core', stage: 'scaling', confidence: 0.82 },
  { id: 'b2', name: 'Usage-based pricing pilot', horizon: 'adjacent', stage: 'piloting', confidence: 0.5 },
  { id: 'b3', name: 'AI copilot for workflow automation', horizon: 'transformational', stage: 'exploring', confidence: 0.3 },
];

export function portfolioRiskBalance(bets: InnovationBet[] = DEFAULT_PORTFOLIO): Record<InnovationBet['horizon'], number> {
  const total = bets.length || 1;
  return {
    core: bets.filter((b) => b.horizon === 'core').length / total,
    adjacent: bets.filter((b) => b.horizon === 'adjacent').length / total,
    transformational: bets.filter((b) => b.horizon === 'transformational').length / total,
  };
}
