import type { Projection, Finding } from "./types";
import { engine, run, CONF_FACTOR } from "./core";
import { measureOrgEntropy, computeLeadershipEnergyBudget } from "./physics";
import {
  buildTemporalProfile,
  correlate,
  resolve as simResolve,
  projectFireDate,
  avoidancePatterns,
  suppressedFindingKeys,
  overconfidenceScore,
  getTopDomain,
  TemporalMode,
} from "./intelligence";

/**
 * DISCLOSURE: this file implements the pasted brief's three pseudocode
 * functions (generateOrganizationalMoment, computeFiveThingsThatMatter,
 * generateHardestQuestion) as closely as the brief's own gaps allow.
 * Two gaps in the brief itself, named explicitly rather than silently
 * filled:
 *   1. The brief shows 3 of "11 more" Organizational Moment templates.
 *      The missing ones are this delivery's own additions, built to cover
 *      every {mode x energy-assessment} combination so the page never
 *      falls through to a mismatched default.
 *   2. `fillTemplate` and `selectMomentTemplate` are referenced but never
 *      defined in the brief. Implemented here as plain string substitution
 *      and a lookup table respectively — disclosed as this session's own
 *      scaffolding, not discovered code.
 */

function fillTemplate(tpl: string, data: Record<string, any>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (data[k] !== undefined && data[k] !== null ? String(data[k]) : `{${k}?}`));
}

// ---------------------------------------------------------------------------
// SECTION 1 — The Organizational Moment
// ---------------------------------------------------------------------------

const MOMENT_TEMPLATES: Record<string, string> = {
  REACTIVE_HIGH_ENERGY:
    "The organization is in reactive mode with {findingCount} active findings, {criticalCount} of them critical. " +
    "The energy balance is positive ({energyBalance}+) — there is momentum to draw from. The risk is that reactive " +
    "urgency exhausts this reserve before the structural causes are addressed. The {topDomain} domain accounts for " +
    "{topDomainPct}% of active findings and deserves sustained focus rather than fire-fighting responses.",
  REACTIVE_BALANCED:
    "The organization is responding to {findingCount} active findings ({criticalCount} critical) in what is mostly " +
    "a reactive posture — {reactivePct}% of findings trace to the last 30 days. Energy is balanced ({energyBalance}), " +
    "which means there is room to respond deliberately rather than merely quickly. The {topDomain} domain is where " +
    "that deliberateness matters most right now, carrying {topDomainPct}% of the load.",
  REACTIVE_DEPLETED:
    "{findingCount} findings are active and most are fresh — {reactivePct}% emerged in the last 30 days — but " +
    "leadership energy is depleted ({energyBalance}, {energyLabel}). Reacting to everything new while running a " +
    "deficit is how small fires become large ones. The {topDomain} domain is both the newest pressure and the one " +
    "most likely to be under-resourced if the pattern continues.",
  REACTIVE_CRITICAL:
    "The organization is reacting to {findingCount} findings ({criticalCount} critical) while leadership energy is " +
    "critically low ({energyBalance}). This is the combination that produces burnout disguised as responsiveness: " +
    "high activity, falling reserve. The {topDomain} domain is pulling the most attention ({topDomainPct}% of " +
    "findings) and is the least affordable place to keep improvising.",
  STRATEGIC_DRIFT_BALANCED:
    "The organization is drifting on a strategic vector established {avgFindingAge} days ago. Most findings emerged " +
    "from decisions and patterns in the {strategicWindow} window. The good news: energy is balanced ({energyBalance}) " +
    "and entropy is {entropyLevel}. The leverage point is not the current state — it is the decision that set this " +
    "direction. Identify when the drift began and what decision preceded it.",
  STRATEGIC_DRIFT_HIGH_ENERGY:
    "A strategic drift is underway — findings cluster {avgFindingAge} days back, in the {strategicWindow} window — " +
    "but it is happening on top of real momentum ({energyBalance}+ energy). That combination is an opportunity: there " +
    "is enough reserve to correct course deliberately, in the {topDomain} domain especially, before drift hardens " +
    "into structure.",
  STRATEGIC_DRIFT_DEPLETED:
    "{strategicPct}% of active findings sit in the 30-180 day strategic window, averaging {avgFindingAge} days old, " +
    "while leadership energy is depleted ({energyBalance}). Correcting a drift takes energy this organization does " +
    "not currently have in reserve. The {topDomain} domain is where the drift is sharpest and where a small, " +
    "well-timed correction would cost the least.",
  STRATEGIC_DRIFT_CRITICAL:
    "The organization is drifting, not reacting — {strategicPct}% of findings are 30-180 days old — and leadership " +
    "energy is critically low ({energyBalance}). This is the quiet-crisis profile: nothing looks urgent, everything " +
    "is getting harder to fix. The {topDomain} domain carries {topDomainPct}% of that drift and is overdue for a " +
    "decision, not another observation.",
  STRUCTURAL_DEPLETED:
    "{structuralPct}% of active findings trace to events older than 180 days. These are not new problems — they are " +
    "established patterns. The leadership energy balance is {energyBalance} ({energyLabel}). Tactical responses to " +
    "structural findings drain energy without changing outcomes. The {topDomain} domain is the epicenter. The " +
    "question is not what to fix this week — it is what structural change would make next quarter different from " +
    "this one.",
  STRUCTURAL_HIGH_ENERGY:
    "{structuralPct}% of active findings are structural — older than 180 days — but leadership energy is high " +
    "({energyBalance}+). That is rare and worth using deliberately: there is enough reserve right now to fund a real " +
    "structural fix in {topDomain} instead of another round of symptom management.",
  STRUCTURAL_BALANCED:
    "{structuralPct}% of active findings are structural in origin, concentrated in {topDomain}. Energy is balanced " +
    "({energyBalance}), entropy is {entropyLevel}. Nothing is forcing a decision this week, which is exactly the " +
    "condition under which structural problems get deferred indefinitely.",
  STRUCTURAL_CRITICAL:
    "{structuralPct}% of active findings are structural, concentrated in {topDomain}, and leadership energy is " +
    "critically low ({energyBalance}). Structural problems do not resolve themselves while reserves are this thin — " +
    "they compound. This is the moment that most needs a decision and least has the energy to make one.",
  BALANCED_DEFAULT:
    "The organization shows {findingCount} active findings spread across temporal horizons with no single mode " +
    "dominating: {reactivePct}% reactive, {strategicPct}% strategic, {structuralPct}% structural. Entropy reads as " +
    "{entropyLevel} and leadership energy is {energyBalance} ({energyLabel}). The {topDomain} domain carries the " +
    "largest single share, at {topDomainPct}% of findings — the closest thing to a clear starting point this moment " +
    "offers.",
};

function energyKey(assessment: string): "HIGH_ENERGY" | "BALANCED" | "DEPLETED" | "CRITICAL" {
  if (assessment.startsWith("HIGH")) return "HIGH_ENERGY";
  if (assessment.startsWith("BALANCED")) return "BALANCED";
  if (assessment.startsWith("DEPLETED")) return "DEPLETED";
  return "CRITICAL";
}

function selectMomentTemplate(mode: TemporalMode, energyAssessment: string): string {
  const e = energyKey(energyAssessment);
  if (mode === "BALANCED") return "BALANCED_DEFAULT";
  const key = `${mode.split("_")[0]}_${e}`;
  // REACTIVE_HIGH_ENERGY, REACTIVE_BALANCED, ... STRUCTURAL_* (matches DEPLETED/BALANCED/CRITICAL/HIGH_ENERGY keys above)
  const normalized = key
    .replace("REACTIVE_HIGH_ENERGY", "REACTIVE_HIGH_ENERGY")
    .replace("STRATEGIC_HIGH_ENERGY", "STRATEGIC_DRIFT_HIGH_ENERGY")
    .replace("STRATEGIC_BALANCED", "STRATEGIC_DRIFT_BALANCED")
    .replace("STRATEGIC_DEPLETED", "STRATEGIC_DRIFT_DEPLETED")
    .replace("STRATEGIC_CRITICAL", "STRATEGIC_DRIFT_CRITICAL")
    .replace("STRUCTURAL_HIGH_ENERGY", "STRUCTURAL_HIGH_ENERGY");
  return MOMENT_TEMPLATES[normalized] ? normalized : "BALANCED_DEFAULT";
}

export interface OrganizationalMoment {
  text: string;
  mode: TemporalMode;
  energyAssessment: string;
  templateKey: string;
}

export function generateOrganizationalMoment(P: Projection, today: string | Date): OrganizationalMoment {
  const temporal = buildTemporalProfile(P, today);
  const entropy = measureOrgEntropy(P, today);
  const energy = computeLeadershipEnergyBudget(P, today);
  const findings = run(P, today).findings;
  const criticalCount = findings.filter((f) => f.sev >= 4).length;
  const top = getTopDomain(P, today);

  const templateKey = selectMomentTemplate(temporal.diagnosis.mode, energy.assessment);
  const template = MOMENT_TEMPLATES[templateKey] || MOMENT_TEMPLATES.BALANCED_DEFAULT;

  const text = fillTemplate(template, {
    findingCount: findings.length,
    criticalCount,
    energyBalance: energy.balance > 0 ? "+" + energy.balance : String(energy.balance),
    energyLabel: energy.assessment,
    topDomain: top.domain,
    topDomainPct: top.pct,
    structuralPct: temporal.proportions.STRUCTURAL.pct,
    strategicPct: temporal.proportions.STRATEGIC.pct,
    reactivePct: temporal.proportions.REACTIVE.pct,
    avgFindingAge: temporal.avgFindingAgeDays,
    strategicWindow: "30-180 days",
    entropyLevel: entropy.interpretation.toLowerCase(),
  });

  return { text, mode: temporal.diagnosis.mode, energyAssessment: energy.assessment, templateKey };
}

// ---------------------------------------------------------------------------
// SECTION 2 — The Five Things That Matter
// ---------------------------------------------------------------------------

export interface LeverageItem {
  finding: Finding;
  leverage: number;
  domainImprovement: number;
  energyCost: number;
  inCluster: boolean;
  leverageReason: string;
  action: string;
  estimatedImpact: string;
}

function generateLeverageReason(item: { inCluster: boolean; prefireMultiplier: number; domainImprovement: number; energyCost: number }): string {
  const reasons: string[] = [];
  if (item.inCluster) reasons.push("part of a correlation pattern");
  if (item.prefireMultiplier > 1) reasons.push("will escalate without action");
  if (item.domainImprovement > 2) reasons.push("high domain impact");
  if (item.energyCost < 3) reasons.push("low energy cost");
  if (!reasons.length) return "Highest leverage given current state.";
  return "Highest leverage because: " + reasons.join(" + ") + ".";
}

export function computeFiveThingsThatMatter(P: Projection, today: string | Date): LeverageItem[] {
  const findings = run(P, today).findings;
  const correlation = correlate(P, today);

  const scored = findings.map((f) => {
    const sim = simResolve(f.key, P, today);
    const domainImprovement = sim ? Math.max(0, sim.heatmapBefore - sim.heatmapAfter) : f.score;

    const energyCost = f.sev * (1 / CONF_FACTOR[f.conf]);

    const inCluster = correlation.clusters.some((c) => c.findings.includes(f.key));
    const patternMultiplier = inCluster ? 1.5 : 1.0;

    const prefire = projectFireDate(f, P, today);
    const prefireMultiplier = prefire === "NOW" ? 1.0 : typeof prefire === "string" ? 1.3 : 1.0;

    const leverage = (domainImprovement * patternMultiplier * prefireMultiplier) / Math.max(0.1, energyCost);

    return { finding: f, leverage, domainImprovement, energyCost, inCluster, prefireMultiplier };
  });

  return scored
    .sort((a, b) => b.leverage - a.leverage)
    .slice(0, 5)
    .map((item) => ({
      finding: item.finding,
      leverage: Math.round(item.leverage * 100) / 100,
      domainImprovement: item.domainImprovement,
      energyCost: Math.round(item.energyCost * 10) / 10,
      inCluster: item.inCluster,
      leverageReason: generateLeverageReason(item),
      action: item.finding.play ? `Open playbook: ${item.finding.play}` : "Address on Roster or at Health",
      estimatedImpact: `Domain score: -${Math.round(item.domainImprovement * 10) / 10} points`,
    }));
}

// ---------------------------------------------------------------------------
// SECTION 3 — The One Question
// ---------------------------------------------------------------------------

export interface HardestQuestion {
  question: string;
  source: string;
  label: string;
}

export function generateHardestQuestion(P: Projection, today: string | Date): HardestQuestion {
  const avoidance = avoidancePatterns(P, today);
  const temporal = buildTemporalProfile(P, today);
  const calibration = overconfidenceScore(P);
  const energy = computeLeadershipEnergyBudget(P, today);
  const suppressed = suppressedFindingKeys(P);
  const todayIso = engine.iso(today);

  const HARD_QUESTIONS: { condition: () => boolean; question: string; source: string }[] = [
    {
      condition: () => avoidance.length >= 2,
      question:
        "Your data shows {n} patterns of possible avoidance. What conversation have you been meaning to have for more than three weeks?",
      source: "avoidance pattern analysis",
    },
    {
      condition: () => temporal.diagnosis.mode === "STRUCTURAL_STRESS" && temporal.proportions.STRUCTURAL.pct > 40,
      question:
        "More than 40% of your findings trace to events older than six months. What decision did you make (or not make) six months ago that is producing these results today?",
      source: "temporal profile analysis",
    },
    {
      condition: () => !!calibration && calibration.gap > 0.25,
      question:
        "When you say you are confident, you are right only {hitRate}% of the time. In which domain do you most often feel certain — and what would it take for you to be wrong?",
      source: "decision calibration data",
    },
    {
      condition: () => energy.balance < -10,
      question:
        "Your leadership energy is depleted — more drains than sources over the last {windowDays} days. What are you holding onto that you should be letting go of?",
      source: "energy budget analysis",
    },
    {
      condition: () => suppressed.length >= 2,
      question:
        "You have snoozed {n} findings three or more times without resolving them. What would it mean — really mean — to resolve these permanently?",
      source: "suppression pattern analysis",
    },
    {
      condition: () => P.successionCandidates.length === 0 && !!P.meta.createdAt && engine._days(P.meta.createdAt, todayIso) > 180,
      question:
        "You have no succession candidates logged after six months of using this system. Who would run this organization if you left tomorrow — and are you building them deliberately?",
      source: "succession data",
    },
    {
      condition: () => {
        const plans = P.growthPlans;
        if (plans.length <= 3) return false;
        const spineMovement = plans.filter((p) => p.spine.length > 1 && p.spine[0].d !== p.spine[p.spine.length - 1].d);
        return spineMovement.length === 0;
      },
      question:
        "You have {planCount} growth plans open with no level movement on any of them. Are you coaching or are you administering coaching?",
      source: "growth plan analysis",
    },
    {
      condition: () => true,
      question:
        "What would your best finding — the one that, if resolved, would change the most — look like in six months if you did nothing about it?",
      source: "leverage analysis",
    },
  ];

  for (const q of HARD_QUESTIONS) {
    if (q.condition()) {
      const text = fillTemplate(q.question, {
        n: avoidance.length || suppressed.length,
        hitRate: calibration?.hitRate,
        windowDays: 30,
        planCount: P.growthPlans.length,
      });
      return {
        question: text,
        source: q.source,
        label: "Generated from your data. This is not a finding — it is a question the data implies. You are the only one who can answer it.",
      };
    }
  }

  // unreachable: last condition is always true
  return { question: "", source: "", label: "" };
}
