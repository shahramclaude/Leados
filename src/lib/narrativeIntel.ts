// src/lib/narrativeIntel.ts
// Narrative generation templates for domain health reporting.
//
// Exported: DOMAIN_HEALTH_TEMPLATES (const, line 13), buildDomainHealthNarrative
//           (function, line 46) — called by strategicIntelligence.ts for
//           BoardIntelligencePack.domainHealthNarrative.

import type { BeliefFabricResult } from './beliefFabric';

type NarrativeTone = 'strong' | 'steady' | 'strained' | 'critical';

const DOMAIN_HEALTH_TEMPLATES: Record<NarrativeTone, string[]> = {
  strong: [
    'Across the fabric of latent signals, the organization is compounding strength rather than managing fragility.',
    'Every domain we track is reinforcing the others — a rare, genuinely low-risk posture.',
  ],
  steady: [
    'The organization is holding its line: no domain is in free-fall, but {domain} deserves a closer look before it drifts.',
    'Overall health is steady; the center of gravity is {domain}, where confidence is still being built.',
  ],
  strained: [
    '{domain} is the clearest source of strain right now, and it is already pulling on adjacent domains — this is the moment to intervene, not monitor.',
    'The fabric shows real stress concentrated in {domain}; left alone, this compounds within a quarter.',
  ],
  critical: [
    '{domain} has crossed from "watch" to "act": the model treats this as a near-term threat to the operating plan, not a trend to track.',
    'This is a critical read on {domain} — the kind of signal that should change what gets discussed in the next leadership meeting, not just the next board deck.',
  ],
};

function toneFromScore(score: number): NarrativeTone {
  if (score >= 78) return 'strong';
  if (score >= 55) return 'steady';
  if (score >= 35) return 'strained';
  return 'critical';
}

/**
 * buildDomainHealthNarrative
 * Produces a 1-2 sentence narrative describing overall organizational health,
 * anchored to the belief fabric's dominant risk domain.
 */
export function buildDomainHealthNarrative(belief: BeliefFabricResult): string {
  const tone = toneFromScore(belief.orgHealthScore);
  const templates = DOMAIN_HEALTH_TEMPLATES[tone];
  const template = templates[belief.dominantRisk.domain.length % templates.length];
  return template.replace(/{domain}/g, prettyDomain(belief.dominantRisk.domain));
}

function prettyDomain(domain: string): string {
  const map: Record<string, string> = {
    revenue: 'the revenue engine',
    product: 'product momentum',
    people: 'team health',
    capital: 'capital position',
    gtm: 'go-to-market',
    operations: 'operational resilience',
  };
  return map[domain] ?? domain;
}

export { DOMAIN_HEALTH_TEMPLATES };
