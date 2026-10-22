import { db } from "@/db";
import {
  automationScores,
  boardPacks,
  chaosExperiments,
  consolidationRuns,
  domains,
  entities,
  metrics,
  processEvents,
  risks,
  strategyItems,
  vocFeedback,
} from "@/db/schema";
import { computeFitnessScore } from "./fitness";
import { getAssuranceSnapshot } from "./assuranceData";
import { rankVocThemes } from "./voc";
import { computeAutomationScore } from "./automation";
import { desc } from "drizzle-orm";

// Read-only aggregation for the dashboard. Deliberately does not write
// snapshots on every page view; use the POST /api/* seam endpoints to
// persist a scored run.
export async function loadDashboard() {
  const [allDomains, allMetrics, assuranceSnapshot, allRisks, allChaos, allEntities, allRuns, allPacks, allStrategy, allVoc, allProcessEvents, allAutomationScores] =
    await Promise.all([
      db.select().from(domains),
      db.select().from(metrics),
      getAssuranceSnapshot(),
      db.select().from(risks),
      db.select().from(chaosExperiments).orderBy(desc(chaosExperiments.runAt)),
      db.select().from(entities),
      db.select().from(consolidationRuns).orderBy(desc(consolidationRuns.runAt)),
      db.select().from(boardPacks).orderBy(desc(boardPacks.generatedAt)),
      db.select().from(strategyItems),
      db.select().from(vocFeedback).orderBy(desc(vocFeedback.receivedAt)),
      db.select().from(processEvents),
      db.select().from(automationScores).orderBy(desc(automationScores.computedAt)),
    ]);

  const fitnessByDomain = allDomains.map((domain) => {
    const domainMetrics = allMetrics.filter((m) => m.domainId === domain.id);
    const fitness = computeFitnessScore(
      domainMetrics.map((m) => ({ name: m.name, value: Number(m.value), target: Number(m.target) })),
    );
    return { domain, metrics: domainMetrics, fitness };
  });

  const latestCheckByEngine = assuranceSnapshot.latestCheckByEngine;
  const assuranceSummary = assuranceSnapshot.summary;

  const vocThemes = rankVocThemes(
    allVoc.map((v) => ({ theme: v.theme, sentiment: v.sentiment as "positive" | "neutral" | "negative" })),
  );

  const processNames = Array.from(new Set(allProcessEvents.map((e) => e.processName)));
  const automationPreview = processNames.map((processName) => {
    const events = allProcessEvents.filter((e) => e.processName === processName);
    return {
      processName,
      live: computeAutomationScore(
        events.map((e) => ({ step: e.step, durationMs: e.durationMs, automatable: e.automatable })),
      ),
    };
  });

  return {
    fitnessByDomain,
    latestCheckByEngine,
    assuranceSummary,
    risks: allRisks,
    chaosExperiments: allChaos,
    entities: allEntities,
    consolidationRuns: allRuns,
    boardPacks: allPacks,
    strategyItems: allStrategy,
    vocFeedback: allVoc,
    vocThemes,
    automationPreview,
    savedAutomationScores: allAutomationScores,
  };
}
