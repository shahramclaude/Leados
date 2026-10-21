// src/lib/synthesis.ts
//
// Deterministic weekly synthesis: a short, citeable digest of what changed
// (metric deltas + notable events) plus the organizational genome. No model
// call — see the scope note in livingDocs.ts for why this part does not
// invent an LLM seam that wasn't actually present in the checkout. Every
// line traces to a metric or event id.
import { getMetricDeltas, getRecentEvents } from "@/lib/narrativeIntel";
import { computeGenome } from "@/lib/genome";

export type SynthesisParagraph = { text: string; evidenceRefs: { kind: "metric" | "event"; id: string }[] };

export type WeeklySynthesis = {
  periodDays: number;
  generatedAt: string;
  paragraphs: SynthesisParagraph[];
  genome: Awaited<ReturnType<typeof computeGenome>>;
};

export async function generateWeeklySynthesis(periodDays = 7): Promise<WeeklySynthesis> {
  const [deltas, events, genome] = await Promise.all([
    getMetricDeltas(periodDays),
    getRecentEvents(periodDays),
    computeGenome(),
  ]);

  const paragraphs: SynthesisParagraph[] = [];

  if (deltas.length > 0) {
    const sorted = [...deltas].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)).slice(0, 5);
    paragraphs.push({
      text: `Largest metric moves in the last ${periodDays} day(s): ${sorted
        .map((d) => `${d.metricName}${d.entityName ? ` (${d.entityName})` : ""} ${d.from}->${d.to} (${d.deltaPct >= 0 ? "+" : ""}${d.deltaPct.toFixed(1)}%)`)
        .join("; ")}.`,
      evidenceRefs: sorted.map((d) => ({ kind: "metric" as const, id: d.id })),
    });
  } else {
    paragraphs.push({ text: `No metric readings recorded in the last ${periodDays} day(s).`, evidenceRefs: [] });
  }

  if (events.length > 0) {
    const sample = events.slice(0, 8);
    paragraphs.push({
      text: `Notable events: ${sample.map((e) => `[${e.type}] ${e.summary}${e.entityName ? ` (${e.entityName})` : ""}`).join("; ")}.`,
      evidenceRefs: sample.map((e) => ({ kind: "event" as const, id: e.id })),
    });
  }

  paragraphs.push({
    text: `Relation mix: ${genome.relationMix.map((r) => `${r.type}=${(r.share * 100).toFixed(0)}%`).join(", ") || "no relations recorded yet"}. Playbook adoption rate: ${(genome.playbookAdoptionRate * 100).toFixed(0)}% across ${genome.activePlaybookCount} active playbook(s).`,
    evidenceRefs: [],
  });

  return { periodDays, generatedAt: new Date().toISOString(), paragraphs, genome };
}
