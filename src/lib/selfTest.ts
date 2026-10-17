// Original runtime self-test suite for this delivery's own math. Does not
// attempt to reproduce any named test IDs from any external/unverified
// source — see AI-SESSION-LOG.md for why.
import { shannonEntropy, mutualInformation, signalToNoise, identifyBottlenecks } from "./infoTheory";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "./casEngine";
import { buildRiskRegister } from "./riskIntelligence";
import type { EventLogEntry, Finding } from "./types";

export interface TestResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

export function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];

  // T1: entropy of a perfectly uniform 4-symbol log should be exactly 2 bits.
  const uniform: EventLogEntry[] = (["commit", "message", "meeting", "review"] as const).flatMap((type, i) =>
    Array.from({ length: 10 }, (_, j) => ({ id: `u${i}-${j}`, ts: j, personId: "p1", type }))
  );
  const ent = shannonEntropy(uniform);
  results.push({
    id: "T1_UNIFORM_ENTROPY",
    label: "Uniform 4-symbol log has entropy = 2 bits",
    pass: approxEqual(ent.bits, 2, 1e-9),
    detail: `Computed ${ent.bits.toFixed(4)} bits (expected 2.0000)`,
  });

  // T2: entropy of a single-symbol log is 0 bits.
  const single: EventLogEntry[] = Array.from({ length: 5 }, (_, j) => ({ id: `s${j}`, ts: j, personId: "p1", type: "commit" }));
  const ent2 = shannonEntropy(single);
  results.push({
    id: "T2_ZERO_ENTROPY",
    label: "Single-symbol log has entropy = 0 bits",
    pass: approxEqual(ent2.bits, 0),
    detail: `Computed ${ent2.bits.toFixed(4)} bits (expected 0)`,
  });

  // T3: mutual information between two fully-overlapping (always co-active) series is maximal (> 0), and independent/disjoint series is 0.
  const hour = 3600000;
  const coA: EventLogEntry[] = [0, 1, 2].map((h) => ({ id: `a${h}`, ts: h * hour, personId: "pA", type: "commit" }));
  const coB: EventLogEntry[] = [0, 1, 2].map((h) => ({ id: `b${h}`, ts: h * hour, personId: "pB", type: "commit" }));
  const miCo = mutualInformation([...coA, ...coB], "pA", "pB");
  results.push({
    id: "T3_MUTUAL_INFO_CORRELATED",
    label: "Perfectly co-occurring activity has mutual information > 0",
    pass: miCo > 0,
    detail: `Computed MI = ${miCo.toFixed(4)} bits (expected > 0)`,
  });

  // T4: signal-to-noise ratio is 0 when there are zero signal-type events.
  const allNoise: EventLogEntry[] = Array.from({ length: 5 }, (_, j) => ({ id: `n${j}`, ts: j, personId: "p1", type: "meeting" }));
  const snr = signalToNoise(allNoise);
  results.push({
    id: "T4_SNR_ZERO",
    label: "All-noise log has signal-to-noise ratio = 0",
    pass: snr === 0,
    detail: `Computed SNR = ${snr} (expected 0)`,
  });

  // T5: a person with far fewer events than the team mean is flagged as a bottleneck.
  const events: EventLogEntry[] = [
    ...Array.from({ length: 20 }, (_, j) => ({ id: `x${j}`, ts: j, personId: "busy", type: "commit" })),
    { id: "y0", ts: 0, personId: "quiet", type: "commit" },
  ];
  const bottlenecks = identifyBottlenecks(events, ["busy", "quiet"]);
  results.push({
    id: "T5_BOTTLENECK_DETECTION",
    label: "Low-activity person is flagged as an information bottleneck",
    pass: bottlenecks.some((b) => b.personId === "quiet"),
    detail: `Flagged: ${bottlenecks.map((b) => b.personId).join(", ") || "(none)"}`,
  });

  // T6: burnout feedback loop detected when R4 + R7 share a person.
  const burnoutFindings: Finding[] = [
    { ruleId: "R4", category: "People", label: "Sustained overtime", severity: 3, personId: "p1", recurrence: 0, ts: 0 },
    { ruleId: "R7", category: "People", label: "Burnout signal", severity: 4, personId: "p1", recurrence: 0, ts: 0 },
  ];
  const loops = identifyFeedbackLoops(burnoutFindings);
  results.push({
    id: "T6_BURNOUT_LOOP",
    label: "R4 + R7 on same person is detected as a burnout feedback loop",
    pass: loops.some((l) => l.id === "BURNOUT:p1"),
    detail: `Loops found: ${loops.map((l) => l.id).join(", ") || "(none)"}`,
  });

  // T7: runway bifurcation triggers at <= 6 months, not above.
  const bifLow = identifyBifurcationPoints([], 6);
  const bifHigh = identifyBifurcationPoints([], 12);
  results.push({
    id: "T7_RUNWAY_BIFURCATION_THRESHOLD",
    label: "Runway bifurcation fires at <= 6 months and not at 12 months",
    pass: bifLow.some((b) => b.id === "RUNWAY_BIFURCATION") && !bifHigh.some((b) => b.id === "RUNWAY_BIFURCATION"),
    detail: `6mo: ${bifLow.map((b) => b.id).join(",")} | 12mo: ${bifHigh.map((b) => b.id).join(",") || "(none)"}`,
  });

  // T8: attractor requires recurrence >= 3.
  const recFindings: Finding[] = [
    { ruleId: "R17", category: "Delivery", label: "Incident recurrence", severity: 3, recurrence: 2, ts: 0 },
    { ruleId: "R18", category: "Delivery", label: "On-call fatigue", severity: 3, recurrence: 3, ts: 0 },
  ];
  const attractors = identifyAttractors(recFindings);
  results.push({
    id: "T8_ATTRACTOR_THRESHOLD",
    label: "Attractor fires only for recurrence >= 3",
    pass: attractors.length === 1 && attractors[0].id.includes("R18"),
    detail: `Attractors: ${attractors.map((a) => a.id).join(", ") || "(none)"}`,
  });

  // T9: risk register always returns exactly 8 categories, even with zero findings.
  const register = buildRiskRegister([]);
  results.push({
    id: "T9_ALWAYS_EIGHT_CATEGORIES",
    label: "Risk register always shows all 8 categories, even at zero",
    pass: register.categories.length === 8 && register.categories.every((c) => c.status === "CLEAR"),
    detail: `Categories: ${register.categories.length}, all CLEAR: ${register.categories.every((c) => c.status === "CLEAR")}`,
  });

  // T10: cross-category amplification detected for R8 + R15.
  const ampFindings: Finding[] = [
    { ruleId: "R8", category: "Finance", label: "Runway under 6 months", severity: 4, recurrence: 0, ts: 0 },
    { ruleId: "R15", category: "Delivery", label: "Velocity decline", severity: 3, recurrence: 0, ts: 0 },
  ];
  const ampRegister = buildRiskRegister(ampFindings);
  results.push({
    id: "T10_CROSS_CATEGORY_AMPLIFICATION",
    label: "R8 + R15 triggers a Finance/Delivery amplification",
    pass: ampRegister.amplifications.some((a) => a.id === "FIN_DELIVERY_AMP"),
    detail: `Amplifications: ${ampRegister.amplifications.map((a) => a.id).join(", ") || "(none)"}`,
  });

  return results;
}
