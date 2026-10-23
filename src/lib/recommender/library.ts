/**
 * Part 51 — Intervention Library read model (Phase 2 "Intervention Library").
 * Marketplace browse view: every intervention plus its measured-outcome
 * badges (one per context signature it has ever been tried in), each with
 * evidence class + sample size + interval, so sparse/strong evidence is
 * visually distinguishable.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recContextEffects } from "@/db/schema";
import { decayedView, type ContextEffectRow } from "./beliefUpdate";
import { ensureInterventionsSeeded, listInterventions } from "./registry";
import type { EvidenceClass, Explain, Intervention } from "./types";

export interface LibraryEntry {
  intervention: Intervention;
  measuredContexts: Array<{
    contextKey: string;
    effect: Explain<number>;
    sourceType: string;
  }>;
  bestEvidenceClass: EvidenceClass;
  totalMeasuredSamples: number;
}

export async function getInterventionLibrary(): Promise<LibraryEntry[]> {
  await ensureInterventionsSeeded();
  const interventions = await listInterventions();
  const entries: LibraryEntry[] = [];

  for (const intervention of interventions) {
    const rows = await db.select().from(recContextEffects).where(eq(recContextEffects.interventionId, intervention.id));

    const measuredContexts = rows
      .filter((r) => r.sourceType !== "prior")
      .map((r) => {
        const row: ContextEffectRow = {
          id: r.id,
          interventionId: r.interventionId,
          contextKey: r.contextKey,
          alpha: r.alpha,
          beta: r.beta,
          sampleSize: r.sampleSize,
          evidenceClass: r.evidenceClass as EvidenceClass,
          sourceType: r.sourceType,
          halfLifeDays: r.halfLifeDays,
          lastUpdated: r.lastUpdated,
        };
        const { effect } = decayedView(row);
        return { contextKey: r.contextKey, effect, sourceType: r.sourceType };
      });

    const rankOf = (ec: EvidenceClass) =>
      ec === "causal_replicated" ? 3 : ec === "experimental" ? 2 : ec === "correlational" ? 1 : 0;
    const bestEvidenceClass = measuredContexts.reduce<EvidenceClass>(
      (best, m) => (rankOf(m.effect.evidenceClass) > rankOf(best) ? m.effect.evidenceClass : best),
      intervention.evidenceClass,
    );
    const totalMeasuredSamples = measuredContexts.reduce((sum, m) => sum + m.effect.sampleSize, 0);

    entries.push({ intervention, measuredContexts, bestEvidenceClass, totalMeasuredSamples });
  }

  return entries.sort((a, b) => b.totalMeasuredSamples - a.totalMeasuredSamples);
}
