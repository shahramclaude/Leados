// ════════════════════════════════════════════════════════════════════
// Evaluates the live rule catalog against the synthetic organization
// dataset: which rules are firing right now, their evidence, their
// recent firing sparkline, and roll-ups into per-domain health scores.
// ════════════════════════════════════════════════════════════════════
import { Rule, RuleContext, Domain, DOMAINS } from "./ruleRegistry";
import { currentContext, historicalContexts } from "./mockOrgData";

export interface FiringResult {
  rule: Rule;
  firing: boolean;
  evidenceText: string | null;
  sparkline: boolean[]; // oldest -> newest, last SPARKLINE_DAYS days
}

const SPARKLINE_DAYS = 14;

export function evaluateRule(rule: Rule, ctx: RuleContext): boolean {
  if (!rule.enabled) return false;
  try {
    return rule.condition(ctx);
  } catch {
    return false;
  }
}

export function evaluateAll(rules: Rule[]): FiringResult[] {
  const ctx = currentContext(rules);
  const history = historicalContexts(rules, SPARKLINE_DAYS);
  return rules.map((rule) => {
    const firing = evaluateRule(rule, ctx);
    const sparkline = history.map((h) => evaluateRule(rule, h));
    let evidenceText: string | null = null;
    if (firing) {
      try {
        evidenceText = rule.evidence(ctx);
      } catch {
        evidenceText = null;
      }
    }
    return { rule, firing, evidenceText, sparkline };
  });
}

const SEVERITY_PENALTY: Record<number, number> = { 1: 2, 2: 5, 3: 10, 4: 18, 5: 28 };

/** Each firing rule deducts points proportional to severity * calibrated weight,
 * bounded to [0,100], giving an at-a-glance health bar per domain. Penalties
 * diminish for the 2nd, 3rd... firing rule in the same domain (signal
 * overload shouldn't instantly zero out a domain the way one catastrophic
 * finding should). */
export function computeDomainHealth(results: FiringResult[]): Record<Domain, number> {
  const scores: Record<Domain, number> = { people: 100, finance: 100, sales: 100, ops: 100, strategy: 100 };
  const byDomain = new Map<Domain, typeof results>();
  for (const d of DOMAINS) byDomain.set(d, []);
  for (const r of results) if (r.firing) byDomain.get(r.rule.domain)?.push(r);

  for (const d of DOMAINS) {
    const firing = (byDomain.get(d) ?? []).sort((a, b) => b.rule.severity - a.rule.severity);
    let score = 100;
    firing.forEach((r, i) => {
      const base = SEVERITY_PENALTY[r.rule.severity] ?? 8;
      const weightFactor = Math.max(0.3, Math.min(1.6, r.rule.weight / r.rule.severity || 1));
      const diminishing = 1 / (1 + i * 0.2);
      score -= base * weightFactor * diminishing;
    });
    scores[d] = Math.round(Math.max(0, Math.min(100, score)));
  }
  return scores;
}

export function computeAveragePrecision(rules: Rule[]): number {
  const withSamples = rules.filter((r) => r.calibration.truePositiveCount + r.calibration.falsePositiveCount > 0);
  if (withSamples.length === 0) return 0;
  const avg =
    withSamples.reduce((sum, r) => {
      const total = r.calibration.truePositiveCount + r.calibration.falsePositiveCount;
      return sum + r.calibration.truePositiveCount / total;
    }, 0) / withSamples.length;
  return Math.round(avg * 1000) / 10; // percentage, 1 decimal
}
