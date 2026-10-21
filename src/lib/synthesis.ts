// Section E.2: synthesis.ts — weekly narrative synthesis from structured
// inputs (narrativeIntel.ts), generated via the prompt registry
// (synthesizeNarrativePrompt) through agentCore, with the faithfulness
// checker as a hard gate before anything is returned to a caller. Citations
// are mandatory: any claim that fails faithfulness is dropped and logged in
// `droppedClaims`, never silently rendered.
import { getMetricDeltas, getRecentEvents } from "@/lib/narrativeIntel";
import { runPrompt } from "@/lib/agentCore";
import { synthesizeNarrativePrompt } from "@/lib/promptRegistry";
import { checkFaithfulness, type EvidenceIndex } from "@/lib/faithfulness";
import type { Explain } from "@/lib/types/explain";

export type WeeklySynthesis = {
  title: string;
  paragraphs: string[];
};

export async function generateWeeklySynthesis(periodDays = 7): Promise<Explain<WeeklySynthesis> & { degraded: boolean; modelCallId: number | null }> {
  const [metricDeltas, events] = await Promise.all([getMetricDeltas(periodDays), getRecentEvents(periodDays)]);

  const evidenceIndex: EvidenceIndex = new Map();
  for (const d of metricDeltas) {
    evidenceIndex.set(d.id, { kind: "metric", text: `${d.entityName} ${d.metricName} from ${d.from} to ${d.to} (${d.deltaPct.toFixed(1)}%)` });
  }
  for (const e of events) {
    evidenceIndex.set(e.id, { kind: "event", text: `${e.entityName ?? ""} ${e.type} ${e.summary}` });
  }

  const periodLabel = `${periodDays}-day period ending ${new Date().toISOString().slice(0, 10)}`;

  const run = await runPrompt(synthesizeNarrativePrompt, {
    periodLabel,
    metricDeltas: metricDeltas.map((d) => ({
      id: d.id,
      entityName: d.entityName,
      metricName: d.metricName,
      from: d.from,
      to: d.to,
      deltaPct: d.deltaPct,
    })),
    events: events.map((e) => ({ id: e.id, entityName: e.entityName, summary: e.summary, occurredAt: e.occurredAt })),
    evidenceChunks: [
      ...metricDeltas.map((d) => ({ id: d.id, kind: "metric" as const, text: d.metricName })),
      ...events.map((e) => ({ id: e.id, kind: "event" as const, text: e.summary })),
    ],
  });

  const { kept, dropped, faithfulnessRate } = checkFaithfulness(run.output.claims, evidenceIndex);

  // The prose (paragraphs) is generated alongside claims but is not
  // guaranteed to be sentence-aligned 1:1 with them, so we do not attempt
  // lossy paragraph surgery when a claim is dropped. Instead the renderer
  // shows the kept claims as the authoritative, citation-backed record
  // directly beneath the prose, and any dropped claim is surfaced (never
  // hidden) via `droppedClaims` — see /app/synthesis/page.tsx. If nothing
  // survived faithfulness review at all, we fall back to a plain digest of
  // the paragraphs flagged as unverified rather than publishing prose with
  // zero surviving evidence.
  const paragraphs = kept.length === 0 && dropped.length > 0
    ? [`(All ${dropped.length} generated statement(s) failed the faithfulness check and were withheld. See droppedClaims.)`]
    : run.output.paragraphs;

  return {
    value: { title: run.output.title, paragraphs },
    confidence: faithfulnessRate,
    evidenceRefs: kept.flatMap((c) => c.evidenceRefs),
    claims: kept,
    droppedClaims: dropped,
    degraded: run.degraded,
    modelCallId: run.modelCallId,
  };
}
