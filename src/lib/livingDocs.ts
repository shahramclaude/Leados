// src/lib/livingDocs.ts
//
// Keeps "living" docs (docs.isLiving = true) current by re-rendering their
// `live` blocks from present-day data (narrativeIntel.ts), leaving `prose`
// blocks untouched, and recording a version + plain-text diff so a reviewer
// can see exactly what changed (mission §F: "no hard-coded narrative
// numbers anywhere").
//
// SCOPE NOTE: the upstream checkout's `livingDocs.ts` called into
// `@/lib/agentCore`, `@/lib/promptRegistry` and `@/lib/faithfulness` (Part
// 08's LLM/RAG seam) to have a model draft the prose around citations. None
// of those three files exist anywhere in the checkout this session could
// fetch (see AI-SESSION-LOG.md), so rather than guess at an LLM API surface
// this part doesn't own, live blocks here render deterministically straight
// from the metric/event read-model — zero model calls, zero hallucination
// risk, and still satisfies "re-renders from current state" exactly. If
// Part 08 ships a real prompt/faithfulness seam later, prose blocks (not
// live blocks) are the natural place to let a model draft narrative text
// around these citeable numbers.
import { getDoc, pushDocVersion, renderBlocks, type DocBlock } from "@/lib/docs";
import { getLatestMetric, getMetricDeltas } from "@/lib/narrativeIntel";

export type LivingDocRegenResult = {
  docId: string;
  previousBody: string;
  newBody: string;
  changed: boolean;
  diff: string;
  unresolvedBlocks: string[];
};

async function resolveLiveBlocks(blocks: DocBlock[]): Promise<{ resolved: Map<string, string>; unresolved: string[] }> {
  const resolved = new Map<string, string>();
  const unresolved: string[] = [];
  for (const b of blocks) {
    if (b.type !== "live") continue;
    const key = `${b.refKind}:${b.refName}:${b.entityId ?? ""}`;
    if (b.refKind === "metric") {
      const metric = await getLatestMetric(b.refName, b.entityId);
      if (metric) {
        resolved.set(key, `${Number(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} (as of ${metric.asOf.toISOString().slice(0, 10)})`);
      } else {
        unresolved.push(key);
      }
    } else if (b.refKind === "finding" || b.refKind === "okr") {
      // Generic numeric read-model lookup: treat "finding"/"okr" refs as metric names too —
      // this part does not own a separate findings/OKR store, so it degrades to the metrics
      // table rather than fabricating a number.
      const deltas = await getMetricDeltas(90, b.entityId);
      const match = deltas.find((d) => d.metricName === b.refName);
      if (match) {
        resolved.set(key, `${match.to} (Δ ${match.deltaPct.toFixed(1)}% vs prior reading, as of ${match.asOf.slice(0, 10)})`);
      } else {
        unresolved.push(key);
      }
    }
  }
  return { resolved, unresolved };
}

export async function regenerateLivingDoc(docId: string): Promise<LivingDocRegenResult> {
  const doc = await getDoc(docId);
  if (!doc) throw new Error("Doc not found");
  if (!doc.isLiving) throw new Error("Doc is not marked as living");

  // Pull the current block structure from the latest version so we know which blocks are "live".
  const { getDocVersions } = await import("@/lib/docs");
  const versions = await getDocVersions(docId);
  const blocks = (versions[0]?.blocks as DocBlock[]) ?? [];

  const { resolved, unresolved } = await resolveLiveBlocks(blocks);
  const newBody = renderBlocks(blocks, resolved);
  const changed = newBody !== doc.body;

  if (!changed) {
    return { docId, previousBody: doc.body, newBody, changed: false, diff: "", unresolvedBlocks: unresolved };
  }

  const { diff } = await pushDocVersion(docId, blocks, newBody);
  return { docId, previousBody: doc.body, newBody, changed: true, diff, unresolvedBlocks: unresolved };
}

/** Regenerate every living doc — the nightly-consolidation capability's doc-refresh step. */
export async function regenerateAllLivingDocs(): Promise<LivingDocRegenResult[]> {
  const { listDocs } = await import("@/lib/docs");
  const livingDocs = await listDocs({ isLiving: true });
  const results: LivingDocRegenResult[] = [];
  for (const doc of livingDocs) {
    results.push(await regenerateLivingDoc(doc.id));
  }
  return results;
}
