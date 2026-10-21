// Section E.2: weekly narrative synthesis. Strong model tier. Raw org data
// is allowed (allowsRawData=true) — this is internal structured data about
// the business, not unvetted external text, and the narrative is useless
// without entity/metric names.
import { z } from "zod";
import { definePrompt } from "./types";
import { ClaimSchema, EvidenceChunkSchema } from "./common";

export const SynthesizeNarrativeInput = z.object({
  periodLabel: z.string(),
  metricDeltas: z.array(
    z.object({
      id: z.string(),
      entityName: z.string(),
      metricName: z.string(),
      from: z.number(),
      to: z.number(),
      deltaPct: z.number(),
    }),
  ),
  events: z.array(
    z.object({ id: z.string(), entityName: z.string().nullable(), summary: z.string(), occurredAt: z.string() }),
  ),
  evidenceChunks: z.array(EvidenceChunkSchema),
});
export type SynthesizeNarrativeInputT = z.infer<typeof SynthesizeNarrativeInput>;

export const SynthesizeNarrativeOutput = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  claims: z.array(ClaimSchema),
});
export type SynthesizeNarrativeOutputT = z.infer<typeof SynthesizeNarrativeOutput>;

function naiveSynthesis(input: SynthesizeNarrativeInputT): SynthesizeNarrativeOutputT {
  const claims: z.infer<typeof ClaimSchema>[] = [];
  const paragraphs: string[] = [];

  const deltaLines = input.metricDeltas.map((d) => {
    const direction = d.deltaPct >= 0 ? "rose" : "fell";
    const text = `${d.entityName} ${d.metricName} ${direction} ${Math.abs(d.deltaPct).toFixed(1)}% (from ${d.from} to ${d.to}).`;
    claims.push({ claim: text, evidenceRefs: [{ kind: "metric", id: d.id }] });
    return text;
  });
  if (deltaLines.length > 0) {
    paragraphs.push(`Metric movement this period: ${deltaLines.join(" ")}`);
  }

  const eventLines = input.events.slice(0, 8).map((e) => {
    const text = `${e.entityName ?? "An unassigned entity"}: ${e.summary} (${e.occurredAt}).`;
    claims.push({ claim: text, evidenceRefs: [{ kind: "event", id: e.id, timestamp: e.occurredAt }] });
    return text;
  });
  if (eventLines.length > 0) {
    paragraphs.push(`Notable events: ${eventLines.join(" ")}`);
  }

  if (paragraphs.length === 0) {
    paragraphs.push("No metric movement or events were recorded for this period.");
  }

  return {
    title: `${input.periodLabel} synthesis (deterministic digest)`,
    paragraphs,
    claims,
  };
}

export const synthesizeNarrativePrompt = definePrompt<SynthesizeNarrativeInputT, SynthesizeNarrativeOutputT>({
  name: "synthesize_narrative",
  version: "1.0.0",
  purpose: "Write a weekly narrative synthesis from structured metric deltas and events, citations mandatory.",
  taskType: "synthesis",
  allowsRawData: true,
  inputSchema: SynthesizeNarrativeInput,
  outputSchema: SynthesizeNarrativeOutput,
  maxTokens: 1200,
  systemPrompt:
    "You write a concise weekly organizational narrative from structured data. " +
    "Every sentence you write must correspond to exactly one claim in the `claims` array, " +
    "and every claim must cite at least one evidenceRef id drawn ONLY from the ids you were given. " +
    "Never state a number that isn't present in the input data. Respond with JSON only.",
  buildUserPrompt: (input) =>
    [
      `Period: ${input.periodLabel}`,
      "Metric deltas:",
      JSON.stringify(input.metricDeltas, null, 2),
      "Events:",
      JSON.stringify(input.events, null, 2),
      "Evidence chunk ids available for citation:",
      JSON.stringify(input.evidenceChunks.map((c) => ({ id: c.id, kind: c.kind })), null, 2),
      "",
      "Return JSON: { title, paragraphs: string[], claims: [{claim, evidenceRefs:[{kind,id}]}] }.",
    ].join("\n"),
  deterministicFallback: naiveSynthesis,
  changelog: [{ version: "1.0.0", date: "2025-11-20", notes: "Initial weekly synthesis prompt." }],
});
