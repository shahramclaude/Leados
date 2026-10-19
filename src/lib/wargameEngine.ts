// Lightweight wargame engine: simulates how a competitor/adversary would
// best-respond to a critical finding or strategic move.
//
// Previously this was a standalone exploration tool (no automatic callers).
// Part 5 wires a lightweight pass of this engine into the strategic
// intelligence layer so critical findings (severity >= 4) automatically get
// an adversary-response simulation instead of requiring a human to open the
// wargame tool manually.

import type { LeadosEvent } from "./types";

export type WargameUrgency = "low" | "medium" | "high" | "critical";

export interface WargameResult {
  domain: string;
  threat: string;
  response: string;
  confidence: number; // 0-1
  urgency: WargameUrgency;
}

const RESPONSE_PLAYBOOK: Record<string, string[]> = {
  pricing: [
    "Undercut pricing by 10-15% in the contested segment",
    "Bundle adjacent features to blunt a pure price comparison",
  ],
  product: [
    "Fast-follow the differentiating feature within one release cycle",
    "Reposition messaging around durability of our existing moat",
  ],
  talent: [
    "Counter-offer key at-risk staff and accelerate retention equity grants",
    "Publicize culture/mission differentiators to stem further attrition",
  ],
  market: [
    "Lock in strategic accounts with multi-year agreements",
    "Expand into an adjacent geography/segment ahead of the challenger",
  ],
  general: [
    "Form a rapid-response task force to monitor and react within 2 weeks",
    "Commission a deeper market-intelligence pass before committing resources",
  ],
};

function pickCategory(domain: string, text: string): keyof typeof RESPONSE_PLAYBOOK {
  const haystack = `${domain} ${text}`.toLowerCase();
  if (/price|pricing|discount|cost/.test(haystack)) return "pricing";
  if (/feature|product|roadmap|launch/.test(haystack)) return "product";
  if (/hire|attrition|talent|resign|retention/.test(haystack)) return "talent";
  if (/market|competitor|segment|geography|expansion/.test(haystack)) return "market";
  return "general";
}

function urgencyFromSeverityAndConfidence(severity: number, confidence: number): WargameUrgency {
  const score = severity * 0.6 + confidence * 5 * 0.4; // blend 1-5 scales
  if (score >= 4.2) return "critical";
  if (score >= 3.2) return "high";
  if (score >= 2) return "medium";
  return "low";
}

/**
 * Simulate the best adversary/competitor response to a single critical
 * finding event. Confidence is a heuristic built from severity, recency and
 * how specific the finding payload is (more structured payload => higher
 * confidence the simulated response is meaningful).
 */
export function simulateAdversaryResponse(finding: LeadosEvent, now: Date): WargameResult {
  const domain = finding.domain ?? "general";
  const payload = (finding.payload ?? {}) as Record<string, unknown>;
  const description =
    (typeof payload.description === "string" && payload.description) ||
    (typeof payload.summary === "string" && payload.summary) ||
    finding.type;

  const category = pickCategory(domain, String(description));
  const playbook = RESPONSE_PLAYBOOK[category];
  const response = playbook[finding.severity % playbook.length];

  const ageHours = Math.max(0, (now.getTime() - new Date(finding.createdAt ?? now).getTime()) / 3_600_000);
  const recencyFactor = Math.max(0.3, 1 - ageHours / (24 * 14)); // decays over two weeks
  const specificityFactor = Object.keys(payload).length > 0 ? 1 : 0.6;
  const severityFactor = finding.severity / 5;

  const confidence = Math.min(
    0.95,
    Math.max(0.05, 0.3 + severityFactor * 0.45 + recencyFactor * 0.15 * specificityFactor),
  );

  return {
    domain,
    threat: String(description),
    response,
    confidence: Number(confidence.toFixed(2)),
    urgency: urgencyFromSeverityAndConfidence(finding.severity, confidence),
  };
}

/** Run the wargame pass across every critical finding (severity >= 4). */
export function runWargamePass(events: LeadosEvent[], now: Date, minSeverity = 4): WargameResult[] {
  return events
    .filter((e) => e.severity >= minSeverity)
    .map((finding) => simulateAdversaryResponse(finding, now));
}
