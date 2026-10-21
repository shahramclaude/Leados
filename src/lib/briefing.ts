// Section E.1: executive briefing. Deterministic core (computed straight
// from narrativeIntel.ts + findings), so the briefing is diffable week over
// week; the LLM only polishes already-cited bullets into prose
// (briefingPolishPrompt) and is structurally unable to add a new fact (see
// that prompt's deterministic fallback — "join the bullets").
import { getMetricDeltas, getRecentEvents, getOpenFindings } from "@/lib/narrativeIntel";
import { runPrompt } from "@/lib/agentCore";
import { briefingPolishPrompt } from "@/lib/promptRegistry";
import type { ClaimT } from "@/lib/promptRegistry/common";
import type { Actor } from "@/lib/agentCore";

export type BriefingSection = { heading: string; prose: string; claims: ClaimT[] };
export type ExecutiveBriefing = {
  asOfDate: string;
  sections: BriefingSection[];
  degraded: boolean;
  modelCallId: number | null;
};

export async function getExecutiveBriefing(actor: Actor = { kind: "agent", id: "briefing.ts" }): Promise<ExecutiveBriefing> {
  const [findings, metricDeltas, events] = await Promise.all([
    getOpenFindings(),
    getMetricDeltas(1),
    getRecentEvents(1),
  ]);

  const overnightFindings: ClaimT[] = findings.map((f) => ({
    claim: `${f.severity.toUpperCase()}: ${f.title}`,
    evidenceRefs: [{ kind: "finding", id: f.id, timestamp: f.createdAt.toISOString() }],
  }));

  const forecastDeltas: ClaimT[] = metricDeltas
    .filter((d) => Math.abs(d.deltaPct) >= 1)
    .map((d) => ({
      claim: `${d.entityName} ${d.metricName} moved ${d.deltaPct >= 0 ? "+" : ""}${d.deltaPct.toFixed(1)}% (now ${d.to}).`,
      evidenceRefs: [{ kind: "metric", id: d.id, timestamp: d.asOf }],
    }));

  const decisionsPending: ClaimT[] = events
    .filter((e) => e.type === "decision" || e.type === "risk_flagged")
    .map((e) => ({
      claim: `${e.entityName ?? "Unassigned"}: ${e.summary}`,
      evidenceRefs: [{ kind: "event", id: e.id, timestamp: e.occurredAt }],
    }));

  const recommendedFocus: ClaimT[] = [...forecastDeltas]
    .sort((a, b) => b.claim.length - a.claim.length)
    .slice(0, 3)
    .map((c) => ({ claim: `Review: ${c.claim}`, evidenceRefs: c.evidenceRefs }));

  const sectionsInput = [
    { heading: "Overnight findings", bullets: overnightFindings },
    { heading: "Forecast deltas", bullets: forecastDeltas },
    { heading: "Decisions pending", bullets: decisionsPending },
    { heading: "Recommended focus", bullets: recommendedFocus },
  ];

  const asOfDate = new Date().toISOString().slice(0, 10);
  const run = await runPrompt(briefingPolishPrompt, { asOfDate, sections: sectionsInput }, actor);

  // Defense in depth: even though the prompt is instructed to return claims
  // unmodified, we never trust that — we always render the deterministic
  // claims, only taking `prose` from the model (or its deterministic
  // fallback) for readability.
  const sections: BriefingSection[] = sectionsInput.map((input, i) => ({
    heading: input.heading,
    prose: run.output.sections[i]?.prose ?? (input.bullets.map((b) => `• ${b.claim}`).join("\n") || "Nothing to report."),
    claims: input.bullets,
  }));

  return { asOfDate, sections, degraded: run.degraded, modelCallId: run.modelCallId };
}
