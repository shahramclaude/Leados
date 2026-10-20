/**
 * ruleEngine.ts — THE canonical, single rule engine for LEADOS.
 *
 * `docs/AUDIT-2026.md` names a duplication cluster of competing rule
 * implementations: `ruleEngine.ts` / `ruleRegistry.ts` / `ruleStore.ts` /
 * `rulesEngine.ts`. This file is the one real implementation. The other
 * three file names are kept as thin, explicitly `@deprecated` modules that
 * import and re-export from here — so any existing call site in the wider
 * program that still imports one of the old names keeps working, but there
 * is only ONE registry, ONE evaluation algorithm, and ONE weight-mutation
 * path (used exclusively by `autoCalibrate.ts`, guardrailed).
 *
 * See: src/lib/platform/intelligence/ruleRegistry.ts
 *      src/lib/platform/intelligence/ruleStore.ts
 *      src/lib/platform/intelligence/rulesEngine.ts
 */

import { explainFinding } from "../../domain/intelligence/explain";
import { fuseRules, type Rule, type RuleInput } from "../../domain/intelligence/ruleTypes";
import type { Explain } from "../../domain/intelligence/types";
import { eventLog } from "./eventLog";

class RuleEngine {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  list(domain?: string): Rule[] {
    const all = [...this.rules.values()];
    return domain ? all.filter((r) => r.domain === domain) : all;
  }

  remove(id: string): void {
    this.rules.delete(id);
  }

  clearForTests(): void {
    this.rules.clear();
  }

  /** Evaluate every registered rule in `domain` against `input`, fuse them
   * via log-odds pooling (`ruleTypes.fuseRules`), and return a fully
   * explainable result — never a bare number (standing order B). */
  evaluateDomain(domain: string, input: RuleInput, priorP = 0.5, asOf = new Date().toISOString()): Explain<number> {
    const rules = this.list(domain);
    if (rules.length === 0) {
      return explainFinding({
        value: priorP,
        drivers: [],
        evidence: [],
        method: "rule-engine:no-rules-registered",
        asOf,
      });
    }
    const { posteriorP, perRule } = fuseRules(priorP, rules, input);
    const drivers = perRule
      .filter((pr) => pr.weightApplied > 0)
      .map((pr) => ({
        factor: pr.rule.description,
        contribution: pr.weightApplied * (pr.result.p - priorP),
        direction: (pr.result.p >= priorP ? "up" : "down") as "up" | "down",
        evidence: pr.result.evidence,
      }));
    const evidence = perRule.flatMap((pr) => pr.result.evidence);
    return explainFinding({
      value: posteriorP,
      drivers,
      evidence,
      method: "rule-engine:log-odds-fusion",
      asOf,
    });
  }

  /**
   * The ONLY path by which a rule's weight may change at runtime. Enforces
   * the ±10%-per-cycle guardrail from standing order D and records an audit
   * event. Callers (`autoCalibrate.ts`) are responsible for having already
   * verified a golden-dataset improvement before calling this.
   */
  /**
   * Trial-only weight mutation used exclusively by `autoCalibrate.ts` while
   * it probes ±10% candidates against the golden dataset. Not audited, not
   * guardrailed — callers MUST restore the original weight (or call
   * `adjustWeight` to commit) before this engine is used for anything else.
   * Kept private-by-convention (exported but named to discourage misuse).
   */
  __setTrialWeightForCalibration(ruleId: string, weight: number): void {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`ruleEngine.__setTrialWeightForCalibration: unknown rule ${ruleId}`);
    rule.weight = weight;
  }

  adjustWeight(ruleId: string, proposedWeight: number, reason: string, actor = "autoCalibrate"): Rule {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`ruleEngine.adjustWeight: unknown rule ${ruleId}`);
    const maxDelta = rule.weight * 0.1;
    const clamped = Math.min(rule.weight + maxDelta, Math.max(rule.weight - maxDelta, proposedWeight));
    const finalWeight = Math.min(1, Math.max(0.25, clamped));
    const before = rule.weight;
    rule.weight = finalWeight;
    eventLog.append("rule.weight.adjusted", {
      ruleId,
      before,
      after: finalWeight,
      requestedDelta: proposedWeight - before,
      appliedDelta: finalWeight - before,
      reason,
    }, actor);
    return rule;
  }
}

export const ruleEngine = new RuleEngine();
export type { Rule, RuleInput };
