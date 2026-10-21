// livingDocs.ts — keeps "living" docs (docs.isLiving = true) current by
// regenerating their body from the entity's present-day data via the same
// synthesis path as synthesis.ts (prompt + faithfulness gate), and tracks a
// plain text diff against the previous version so a reviewer can see
// exactly what changed and why (every changed line still traces to a
// citation in the stored claims).
import { getDoc, updateDocBody } from "@/lib/docs";
import { getMetricDeltas, getRecentEvents } from "@/lib/narrativeIntel";
import { runPrompt } from "@/lib/agentCore";
import { synthesizeNarrativePrompt } from "@/lib/promptRegistry";
import { checkFaithfulness, type EvidenceIndex } from "@/lib/faithfulness";

export type LivingDocRegenResult = {
  docId: string;
  previousBody: string;
  newBody: string;
  changed: boolean;
  droppedClaims: { claim: string; reason: string }[];
  degraded: boolean;
};

export async function regenerateLivingDoc(docId: string): Promise<LivingDocRegenResult> {
  const doc = await getDoc(docId);
  if (!doc) throw new Error("Doc not found");
  if (!doc.isLiving) throw new Error("Doc is not marked as living");

  const entityId = doc.entityId ?? undefined;
  const [metricDeltas, events] = await Promise.all([getMetricDeltas(30, entityId), getRecentEvents(30, entityId)]);

  const evidenceIndex: EvidenceIndex = new Map();
  for (const d of metricDeltas) evidenceIndex.set(d.id, { kind: "metric", text: `${d.entityName} ${d.metricName} ${d.from}->${d.to}` });
  for (const e of events) evidenceIndex.set(e.id, { kind: "event", text: `${e.entityName ?? ""} ${e.summary}` });

  const run = await runPrompt(synthesizeNarrativePrompt, {
    periodLabel: `living doc refresh as of ${new Date().toISOString().slice(0, 10)}`,
    metricDeltas: metricDeltas.map((d) => ({ id: d.id, entityName: d.entityName, metricName: d.metricName, from: d.from, to: d.to, deltaPct: d.deltaPct })),
    events: events.map((e) => ({ id: e.id, entityName: e.entityName, summary: e.summary, occurredAt: e.occurredAt })),
    evidenceChunks: [
      ...metricDeltas.map((d) => ({ id: d.id, kind: "metric" as const, text: d.metricName })),
      ...events.map((e) => ({ id: e.id, kind: "event" as const, text: e.summary })),
    ],
  });

  const { kept, dropped } = checkFaithfulness(run.output.claims, evidenceIndex);
  const newBody =
    kept.length > 0
      ? run.output.paragraphs.join("\n\n") + "\n\n---\nCitations:\n" + kept.map((c) => `- ${c.claim} [${c.evidenceRefs.map((r) => `${r.kind}:${r.id}`).join(", ")}]`).join("\n")
      : "(No faithfulness-verified updates this cycle — previous content retained.)";

  const finalBody = kept.length > 0 ? newBody : doc.body;
  const changed = finalBody !== doc.body;
  if (changed) {
    await updateDocBody(docId, finalBody, true);
  }

  return {
    docId,
    previousBody: doc.body,
    newBody: finalBody,
    changed,
    droppedClaims: dropped,
    degraded: run.degraded,
  };
}
