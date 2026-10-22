// Part 28 — conformance checking.
//
// HONESTY CONTRACT (see standing order #6 and Phase 5 Q2):
//  - Checking a case against the *mined* model only tells you the case took
//    a STATISTICALLY RARE path relative to the rest of the log. That is not
//    the same as "wrong". A rare path can be a perfectly healthy exception
//    (e.g. an escalation, a VIP fast-track). We label these `severity:
//    "statistical"` and never call them non-conformant on their own.
//  - Checking a case against a *declared* ProcessDefinition is the only mode
//    that can assert a rule was actually violated (skip of a mandatory step,
//    a transition that isn't in the declared allow-list, out-of-order
//    mandatory steps). We label these `severity: "rule"`.
//  - `conformant` in the report is computed ONLY from rule-severity
//    deviations. Statistical deviations are always reported but never by
//    themselves flip a case to non-conformant — this is the concrete guard
//    against the over-standardization failure mode.
import type {
  CaseInstance,
  ConformanceReport,
  ConformanceResult,
  Deviation,
  DiscoveredModel,
  ProcessDefinition,
} from "./types";

export function checkConformanceAgainstMined(
  cases: CaseInstance[],
  model: DiscoveredModel,
): ConformanceReport {
  const keptEdges = new Set(model.edges.filter((e) => e.kept).map((e) => `${e.from}->${e.to}`));

  const results: ConformanceResult[] = cases.map((c) => {
    const deviations: Deviation[] = [];
    const seenCount = new Map<string, number>();

    for (let i = 0; i < c.events.length; i++) {
      const activity = c.events[i].activity;
      seenCount.set(activity, (seenCount.get(activity) ?? 0) + 1);
      if (i > 0) {
        const from = c.events[i - 1].activity;
        const to = activity;
        if (!keptEdges.has(`${from}->${to}`)) {
          deviations.push({
            type: "unseen_transition",
            detail: `Transition "${from}" -> "${to}" is not a frequent/typical path in the mined model.`,
            activity: to,
            severity: "statistical",
          });
        }
      }
    }

    for (const [activity, count] of seenCount) {
      if (count > 1) {
        deviations.push({
          type: "rework",
          detail: `Activity "${activity}" occurred ${count} times in this case.`,
          activity,
          severity: "statistical",
        });
      }
    }

    // Against the mined model alone there is no notion of "mandatory step",
    // so rule-severity conformance is vacuously true here.
    return { caseId: c.caseId, conformant: true, deviations };
  });

  return summarize(model.processName, "mined", results);
}

export function checkConformanceAgainstDeclared(
  cases: CaseInstance[],
  definition: ProcessDefinition,
): ConformanceReport {
  const mandatoryActivities = new Set(definition.steps.filter((s) => s.mandatory).map((s) => s.activity));
  const allowedNext = new Map(definition.steps.map((s) => [s.activity, new Set(s.allowedNext)]));
  const stepOrder = new Map(definition.steps.map((s, idx) => [s.activity, idx]));

  const results: ConformanceResult[] = cases.map((c) => {
    const deviations: Deviation[] = [];
    const seenActivities = new Set<string>();
    const seenCount = new Map<string, number>();
    let lastOrderIdx = -1;

    for (let i = 0; i < c.events.length; i++) {
      const activity = c.events[i].activity;
      seenActivities.add(activity);
      seenCount.set(activity, (seenCount.get(activity) ?? 0) + 1);

      if (i > 0) {
        const from = c.events[i - 1].activity;
        // Immediate self-repeats (A -> A, e.g. a retry/redo of the same step)
        // are classified purely as "rework" below, not as an undeclared
        // transition. Treating a retry as a hard rule violation is exactly
        // the over-standardization failure mode we want to avoid — see
        // Phase 5 honesty notes.
        if (from === activity) continue;
        const allowSet = allowedNext.get(from);
        if (allowSet && !allowSet.has(activity)) {
          deviations.push({
            type: "unseen_transition",
            detail: `Transition "${from}" -> "${activity}" is not declared as allowed from "${from}".`,
            activity,
            severity: "rule",
          });
        }
      }

      const orderIdx = stepOrder.get(activity);
      if (orderIdx !== undefined) {
        if (orderIdx < lastOrderIdx) {
          deviations.push({
            type: "reorder",
            detail: `"${activity}" (declared position ${orderIdx}) occurred after a later-positioned step.`,
            activity,
            severity: "rule",
          });
        }
        lastOrderIdx = Math.max(lastOrderIdx, orderIdx);
      }
    }

    for (const mandatory of mandatoryActivities) {
      if (!seenActivities.has(mandatory)) {
        deviations.push({
          type: "skip",
          detail: `Mandatory step "${mandatory}" was never observed in this case.`,
          activity: mandatory,
          severity: "rule",
        });
      }
    }

    for (const [activity, count] of seenCount) {
      if (count > 1) {
        deviations.push({
          type: "rework",
          detail: `Activity "${activity}" occurred ${count} times in this case.`,
          activity,
          severity: "statistical",
        });
      }
    }

    const conformant = deviations.every((d) => d.severity !== "rule");
    return { caseId: c.caseId, conformant, deviations };
  });

  return summarize(definition.processName, "declared", results);
}

function summarize(
  processName: string,
  checkedAgainst: "mined" | "declared",
  results: ConformanceResult[],
): ConformanceReport {
  const conformantCount = results.filter((r) => r.conformant).length;
  return {
    processName,
    checkedAgainst,
    caseCount: results.length,
    conformantCount,
    conformanceRate: results.length ? conformantCount / results.length : 1,
    results,
  };
}
