// F. Board pack & strategic reports. Deterministic, publication-quality
// template: identical inputs (same DB snapshot) -> identical content hash.
// Every figure traces to an assumption or an event via the evidence appendix.
import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { contentHash, round2 } from "@/lib/format";
import { stateOfTheBusiness, evaluateIndicators, decisionsNeededThisWeek } from "@/lib/strategicIntelligence";
import { baseForecast, runwayDistribution, runwayTornado, covenantHeadroom, fundraisingReadiness } from "@/lib/financialOS";
import { getCascade } from "@/lib/okr";
import { allProjectStatuses } from "@/lib/executionEngine";
import { deliveryConfidence } from "@/lib/delivery";
import { listDecisions } from "@/lib/decisionEngine";
import { diffScenarios, listScenarios } from "@/lib/scenarioEngine";
import { assumptionsAsMap } from "@/lib/assumptions";
import { polishList } from "@/lib/narrative";

function stripVolatile<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripVolatile) as unknown as T;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (["computedAt", "generatedAt", "lastEvaluatedAt", "createdAt", "lastCheckIn"].includes(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out as T;
  }
  return value;
}

export async function generateBoardPack(periodLabel: string) {
  const [sob, forecast, runway, tornado, covenants, readiness, cascade, projectStatuses, decisionsRaw, decisionsNeeded, scenarios, assumptionMap] = await Promise.all([
    stateOfTheBusiness(),
    baseForecast(12),
    runwayDistribution(800, 36, 23),
    runwayTornado(),
    covenantHeadroom(),
    fundraisingReadiness(),
    getCascade(),
    allProjectStatuses(),
    listDecisions(),
    decisionsNeededThisWeek(),
    listScenarios(),
    assumptionsAsMap(),
  ]);

  const deliveryConfidences = await Promise.all(projectStatuses.map((p) => deliveryConfidence(p.project.id)));
  const scenarioIds = scenarios.map((s) => s.id).slice(0, 3);
  const scenarioDiff = scenarioIds.length ? await diffScenarios(scenarioIds, 6) : null;

  const topRisks: string[] = [];
  const breaches = (await evaluateIndicators()).filter((i) => i.status === "breach");
  for (const b of breaches) topRisks.push(`${b.name} in breach: ${b.currentValue} vs threshold ${b.threshold} (${b.domain})`);
  for (const p of projectStatuses.filter((p) => p.derivedStatus === "blocked" || p.derivedStatus === "at_risk")) {
    topRisks.push(`Project "${p.project.title}" is ${p.derivedStatus} — schedule gap ${round2(p.scheduleGapDays)}d, ${p.openBlockerCount} open blocker(s)`);
  }
  for (const c of covenants.filter((c) => c.value.breached)) topRisks.push(`Covenant "${c.value.name}" breached: ${c.value.metric} = ${round2(c.value.value)} (threshold ${c.value.threshold})`);
  if (runway.value.p10 < 6) topRisks.push(`Downside runway (p10) is only ${round2(runway.value.p10)} months`);

  const decisionsSection = decisionsNeeded.map((d) => ({
    id: d.decision.id,
    title: d.decision.title,
    reversibility: d.decision.reversibility,
    reviewDate: d.decision.reviewDate,
    options: d.evByOption.map((o) => ({ label: o.label, evP50: o.ev ? round2(o.ev.value.p50) : null, evP10: o.ev ? round2(o.ev.value.p10) : null, evP90: o.ev ? round2(o.ev.value.p90) : null })),
  }));

  // Evidence appendix: every assumption/evidence ref actually used above, deduped.
  const assumptionKeysUsed = new Set<string>([...sob.assumptionsUsed, ...runway.assumptionsUsed, ...tornado.assumptionsUsed]);
  const evidenceAppendix = [...assumptionKeysUsed].sort().map((key) => ({
    assumptionKey: key,
    label: assumptionMap[key]?.label ?? key,
    owner: assumptionMap[key]?.owner ?? "unassigned",
    range: assumptionMap[key] ? `${assumptionMap[key].low} / ${assumptionMap[key].base} / ${assumptionMap[key].high} ${assumptionMap[key].unit}` : "n/a",
    rationale: assumptionMap[key]?.rationale ?? "",
  }));

  const payload = {
    periodLabel,
    narrativeSummary: sob.value.narrative,
    narrativeActions: sob.value.actions,
    okr: {
      healthScore: cascade.value.healthScore,
      objectives: cascade.value.objectives.map((o) => ({ title: o.title, owner: o.owner, attainment: round2(o.attainment), status: o.derivedStatus })),
      statusDisagreements: cascade.value.statusDisagreements,
      orphanKeyResults: cascade.value.orphanKeyResults,
      uncoveredObjectives: cascade.value.uncoveredObjectives,
    },
    financialPosition: {
      anchorMonth: forecast.anchor.month,
      latestCash: forecast.anchor.cash,
      runwayMonths: { p10: round2(runway.value.p10), p50: round2(runway.value.p50), p90: round2(runway.value.p90) },
      dominantRunwayDriver: tornado.value[0] ?? null,
      fundraisingReadiness: readiness.value,
      covenants: covenants.map((c) => c.value),
      scenarioDiff,
    },
    delivery: projectStatuses.map((p, i) => ({
      project: p.project.title,
      derivedStatus: p.derivedStatus,
      percentComplete: round2(p.percentComplete),
      confidenceOnTime: deliveryConfidences[i] ? round2(deliveryConfidences[i]!.value) : null,
    })),
    topRisks,
    decisionsNeeded: decisionsSection,
    evidenceAppendix,
  };

  const hash = contentHash(stripVolatile(payload));
  const asOf = new Date();

  const [row] = await db
    .insert(boardPacks)
    .values({ periodLabel, asOf, contentHash: hash, payload })
    .returning();

  return { ...row, payload };
}

export function renderBoardPackMarkdown(pack: Awaited<ReturnType<typeof generateBoardPack>>): string {
  const p = pack.payload;
  return [
    `# LEADOS Board Pack — ${p.periodLabel}`,
    "",
    "## Narrative Summary",
    p.narrativeSummary,
    "",
    "### Recommended actions",
    polishList(p.narrativeActions, "No actions flagged this period."),
    "",
    "## OKR Status",
    `Cascade health score: ${p.okr.healthScore}/100`,
    ...p.okr.objectives.map((o) => `- **${o.title}** (${o.owner}): ${(o.attainment * 100).toFixed(0)}% — ${o.status}`),
    p.okr.statusDisagreements.length ? `\n**Disagreements (self-reported vs derived):** ${p.okr.statusDisagreements.map((d) => `${d.title} (${d.selfReported} vs ${d.derived})`).join("; ")}` : "",
    "",
    "## Financial Position",
    `Cash: $${p.financialPosition.latestCash.toLocaleString()} | Runway p50: ${p.financialPosition.runwayMonths.p50}mo (p10 ${p.financialPosition.runwayMonths.p10} / p90 ${p.financialPosition.runwayMonths.p90})`,
    p.financialPosition.dominantRunwayDriver ? `Dominant runway assumption: ${p.financialPosition.dominantRunwayDriver.label} (owner: ${p.financialPosition.dominantRunwayDriver.owner})` : "",
    "",
    "## Top Risks",
    polishList(p.topRisks, "No material risks flagged this period."),
    "",
    "## Decisions Needed This Week",
    polishList(p.decisionsNeeded.map((d) => `${d.title} — ${d.options.map((o) => `${o.label}: EV p50 $${o.evP50 ?? "n/a"}`).join(", ")}`), "No decisions pending."),
    "",
    "## Evidence Appendix",
    ...p.evidenceAppendix.map((e) => `- \`${e.assumptionKey}\` — ${e.label} (owner: ${e.owner}, range ${e.range}): ${e.rationale}`),
    "",
    `_Content hash: ${pack.contentHash}_`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
