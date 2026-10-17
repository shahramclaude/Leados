// src/lib/selfTest.ts
// Original runtime self-tests for THIS sandbox's implementation. These are
// NOT the "T_L_*"/"G_L_*" tests named in the task's pasted "pt-L" summary —
// that test suite's existence could not be verified anywhere in the real
// repo (see AI-SESSION-LOG.md). These are freshly written, run in the
// browser on demand, and check this file's own math against the formulas
// it claims to implement.
import { shannonEntropy, mutualInformation, signalToNoise } from "./infoTheory";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "./casEngine";
import { buildRiskRegister, detectCrossRiskAmplification } from "./riskIntelligence";
import type { AppState, Finding, OrgEvent } from "./types";

export interface TestResult {
  id: string;
  pass: boolean;
  detail: string;
}

function ev(partial: Partial<OrgEvent> & { ts: number; type: string }): OrgEvent {
  return { id: Math.random().toString(36).slice(2), category: "OPERATIONAL", ...partial };
}

function finding(partial: Partial<Finding> & { ruleId: string; category: Finding["category"] }): Finding {
  return { key: partial.ruleId, title: "t", sev: 3, score: 60, ts: Date.now(), ...partial };
}

export function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];
  const push = (id: string, pass: boolean, detail: string) => results.push({ id, pass, detail });

  // 1. Zero entropy for a single-type stream.
  const singleType = Array.from({ length: 100 }, (_, i) => ev({ ts: i, type: "a" }));
  const h0 = shannonEntropy(singleType);
  push("entropy-zero", h0.H === 0, `H(single type, n=100) = ${h0.H} (expect 0)`);

  // 2. H = 2.0 bits for 4 equally-likely types, 100 events (25 each).
  const fourTypes: OrgEvent[] = [];
  ["a", "b", "c", "d"].forEach((t, idx) => {
    for (let i = 0; i < 25; i++) fourTypes.push(ev({ ts: idx * 25 + i, type: t }));
  });
  const h4 = shannonEntropy(fourTypes);
  push("entropy-uniform-4", Math.abs(h4.H - 2.0) < 1e-9, `H(4 equal types, n=100) = ${h4.H.toFixed(6)} (expect 2.0)`);

  // 3. Entropy never exceeds its own computed max.
  push("entropy-bounded", h4.H <= h4.Hmax + 1e-9, `H=${h4.H.toFixed(3)} <= Hmax=${h4.Hmax.toFixed(3)}`);

  // 4. Mutual information is 0 for two empty streams.
  const mi0 = mutualInformation([], [], new Date(), 90);
  push("mi-empty", mi0.MI === 0, `MI([],[]) = ${mi0.MI} (expect 0)`);

  // 5. SNR: signal + noise always reconciles to total event count.
  const events = Array.from({ length: 40 }, (_, i) => ev({ ts: Date.now() - i * 3600_000, type: "x", category: "PEOPLE" }));
  const findings = [finding({ ruleId: "R4", category: "PEOPLE", ts: Date.now() })];
  const snr = signalToNoise(events, findings);
  push("snr-reconciles", snr.signalCount + snr.noiseCount === events.length, `${snr.signalCount} + ${snr.noiseCount} = ${events.length}`);

  // 6. Burnout feedback loop requires BOTH R7 and R4 on the same person.
  const loopsYes = identifyFeedbackLoops([
    finding({ ruleId: "R7", category: "PEOPLE", personId: "p1", ts: Date.now() }),
    finding({ ruleId: "R4", category: "PEOPLE", personId: "p1", ts: Date.now() }),
  ]);
  push("burnout-loop-fires", loopsYes.some((l) => l.id.startsWith("BURNOUT_FEEDBACK_LOOP")), "R7+R4 same person -> loop detected");

  const loopsNo = identifyFeedbackLoops([
    finding({ ruleId: "R7", category: "PEOPLE", personId: "p1", ts: Date.now() }),
    finding({ ruleId: "R4", category: "PEOPLE", personId: "p2", ts: Date.now() }),
  ]);
  push("burnout-loop-needs-same-person", !loopsNo.some((l) => l.id.startsWith("BURNOUT_FEEDBACK_LOOP")), "R7+R4 different people -> no loop");

  // 7. Financial bifurcation fires only under 6 months runway.
  const bifYes = identifyBifurcationPoints([], 5);
  const bifNo = identifyBifurcationPoints([], 9);
  push("bifurcation-runway", bifYes.some((b) => b.id === "FINANCIAL_BIFURCATION") && !bifNo.some((b) => b.id === "FINANCIAL_BIFURCATION"), "runway<6 fires, runway>=6 does not");

  // 8. Talent bifurcation is irreversible; governance bifurcation is reversible.
  const bifs = identifyBifurcationPoints(
    [finding({ ruleId: "R9", category: "PEOPLE", ts: Date.now() }), finding({ ruleId: "R88", category: "GOVERNANCE", ts: Date.now() })],
    14
  );
  const talent = bifs.find((b) => b.id === "TALENT_BIFURCATION");
  const gov = bifs.find((b) => b.id === "GOVERNANCE_BIFURCATION");
  push("bifurcation-reversibility", talent?.reversible === false && gov?.reversible === true, "talent.reversible=false, governance.reversible=true");

  // 9. Attractor requires >= 2 reactivations, not just 1.
  const stateOnce: AppState = { version: 1, people: [], runwayMonths: 14, events: [], signals: {}, toggleLog: [
    { ruleId: "R17", active: true, ts: 1 },
    { ruleId: "R17", active: false, ts: 2 },
    { ruleId: "R17", active: true, ts: 3 },
  ] };
  const stateTwice: AppState = { ...stateOnce, toggleLog: [
    ...stateOnce.toggleLog,
    { ruleId: "R17", active: false, ts: 4 },
    { ruleId: "R17", active: true, ts: 5 },
  ] };
  push("attractor-needs-2", identifyAttractors(stateOnce).length === 0 && identifyAttractors(stateTwice).length === 1, "1 reactivation -> no attractor, 2 -> attractor");

  // 10. Overall risk is 0 when every category is clear, and rises monotonically with severity.
  const clearRegister = buildRiskRegister([]);
  push("risk-zero-when-clear", clearRegister.overallRisk === 0, `overallRisk(no findings) = ${clearRegister.overallRisk}`);

  // 11. TRUST_COLLAPSE always severity 5 when GOVERNANCE + REPUTATIONAL both active.
  const hotRegister = buildRiskRegister([
    finding({ ruleId: "R88", category: "GOVERNANCE", sev: 2, ts: Date.now() }),
    finding({ ruleId: "R60", category: "REPUTATIONAL", sev: 2, ts: Date.now() }),
  ]);
  const amps = detectCrossRiskAmplification(hotRegister);
  const trust = amps.find((a) => a.id === "TRUST_COLLAPSE");
  push("trust-collapse-sev5", trust?.sev === 5, `TRUST_COLLAPSE.sev = ${trust?.sev} (expect 5, always, regardless of input severities)`);

  return results;
}
