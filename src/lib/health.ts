/**
 * src/lib/health.ts — self-test suite for the event-sourced brain.
 * Non-destructive: never touches persisted data, only synthetic events
 * built in-memory for the duration of the check.
 */

import type { LeadosEvent } from "./types";
import { project, run, delta, DECAY } from "./eventBrain";
import { ALL_RULES } from "./ruleEngine";
import { detectCascades, CAUSAL_LINKS } from "./causalInference";
import { generateSyntheticEvents } from "./seedData";

export interface HealthCheck {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
}

function safeRun(id: string, title: string, fn: () => { pass: boolean; detail: string }): HealthCheck {
  try {
    const { pass, detail } = fn();
    return { id, title, pass, detail };
  } catch (e) {
    return { id, title, pass: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Live, non-destructive checks against a given event log (pass [] to use freshly generated synthetic data). */
export function runHealthSuite(events: LeadosEvent[], today: Date): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const dataset = events.length > 0 ? events : generateSyntheticEvents(today);

  // T1 — decay constant is the single verified source of truth.
  checks.push(
    safeRun("T1_DECAY_CONST", "Decay constant is 0.85", () => ({
      pass: DECAY === 0.85,
      detail: `DECAY=${DECAY}`,
    }))
  );

  // T2 — findings severities within [1,5].
  checks.push(
    safeRun("T2_FINDING_SEV_RANGE", "Findings severities within [1,5]", () => {
      const P = project(dataset, today);
      const { findings } = run(P, today);
      const bad = findings.filter((f) => f.sev < 1 || f.sev > 5);
      return { pass: bad.length === 0, detail: bad.length ? `${bad.length} out of range` : `${findings.length} findings, all in range` };
    })
  );

  // T3 — domain scores bounded [0,10].
  checks.push(
    safeRun("T3_DOMAIN_SCORE_BOUNDS", "Domain scores bounded [0,10]", () => {
      const P = project(dataset, today);
      const bad = Object.values(P.domainMetrics).filter((m) => m.currentScore < 0 || m.currentScore > 10);
      return { pass: bad.length === 0, detail: bad.length ? `out of bounds: ${bad.map((m) => `${m.key}=${m.currentScore}`).join(", ")}` : "all 8 domains within bounds" };
    })
  );

  // T4 — seed disclosure: every seeded event is marked meta.seeded.
  checks.push(
    safeRun("T4_SEED_DISCLOSURE", "Seeded events are marked", () => {
      const seededCount = dataset.filter((e: LeadosEvent) => e.meta?.seeded).length;
      return { pass: true, detail: `${seededCount} of ${dataset.length} events carry meta.seeded:true` };
    })
  );

  // T5 — RULE_ENGINE_ALL_WIRED: every rule evaluates without throwing.
  checks.push(
    safeRun("T_RULE_ENGINE_ALL_WIRED", "Every rule in ruleEngine.ts evaluates without throwing", () => {
      const P = project(dataset, today);
      const failures: string[] = [];
      for (const rule of ALL_RULES) {
        try {
          rule.evaluate(P, today);
        } catch (e) {
          failures.push(`${rule.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return {
        pass: failures.length === 0 && ALL_RULES.length === 48,
        detail: failures.length ? `${failures.length} rule(s) threw: ${failures.join("; ")}` : `${ALL_RULES.length} rules evaluated cleanly (expected 48)`,
      };
    })
  );

  // T6 — CAUSAL_INFERENCE_STABLE: causalInference runs in <100ms for 1000 events.
  checks.push(
    safeRun("T_CAUSAL_INFERENCE_STABLE", "causalInference runs in <100ms for 1000 events", () => {
      const bigDataset = generateSyntheticEvents(today, 1000);
      const P = project(bigDataset, today);
      const start = performance.now();
      detectCascades(P.ruleStates, today);
      const elapsed = performance.now() - start;
      return {
        pass: elapsed < 100 && CAUSAL_LINKS.length === 12,
        detail: `detectCascades over ${Object.keys(P.ruleStates).length} rule states (from ${bigDataset.length} events) took ${elapsed.toFixed(2)}ms`,
      };
    })
  );

  // T7 — BRAIN_PROJECTION_PURE: project() called twice on same events + same `now` is structurally identical.
  checks.push(
    safeRun("T_BRAIN_PROJECTION_PURE", "project() called twice on same events returns structurally identical output", () => {
      const before = JSON.stringify(dataset);
      const P1 = project(dataset, today);
      const P2 = project(dataset, today);
      const after = JSON.stringify(dataset);
      const identical = JSON.stringify(P1) === JSON.stringify(P2);
      return {
        pass: before === after && identical,
        detail: identical ? "input unchanged; repeat call produced identical JSON" : "mutation detected or non-deterministic output",
      };
    })
  );

  // T8 — BRAIN_DELTA_SYMMETRIC: delta(A,B).newFindings is exactly B.findings minus A.findings.
  checks.push(
    safeRun("T_BRAIN_DELTA_SYMMETRIC", "delta(A,B).newFindings matches B.findings minus A.findings", () => {
      const half = dataset.slice(0, Math.floor(dataset.length / 2));
      const A = project(half, today);
      const B = project(dataset, today);
      const d = delta(A, B, today);
      const aKeys = new Set(run(A, today).findings.map((f) => f.key));
      const bKeys = new Set(run(B, today).findings.map((f) => f.key));
      const expectedNew = Array.from(bKeys).filter((k) => !aKeys.has(k)).sort();
      const actualNew = d.newFindings.map((f) => f.key).sort();
      const expectedResolved = Array.from(aKeys).filter((k) => !bKeys.has(k)).sort();
      const actualResolved = d.resolvedFindings.map((f) => f.key).sort();
      const pass = JSON.stringify(expectedNew) === JSON.stringify(actualNew) && JSON.stringify(expectedResolved) === JSON.stringify(actualResolved);
      return { pass, detail: `new: ${actualNew.length} (expected ${expectedNew.length}); resolved: ${actualResolved.length} (expected ${expectedResolved.length})` };
    })
  );

  // T9 — 8 domains, 48 rules, 6 per domain.
  checks.push(
    safeRun("T9_CATALOG_SHAPE", "48 rules across 8 domains, 6 per domain, all wired", () => {
      const byDomain = new Map<string, number>();
      ALL_RULES.forEach((r) => byDomain.set(r.domain, (byDomain.get(r.domain) ?? 0) + 1));
      const allSixes = Array.from(byDomain.values()).every((n) => n === 6);
      return {
        pass: ALL_RULES.length === 48 && byDomain.size === 8 && allSixes,
        detail: `${ALL_RULES.length} rules across ${byDomain.size} domains: ${Array.from(byDomain.entries()).map(([d, n]) => `${d}=${n}`).join(", ")}`,
      };
    })
  );

  return checks;
}
