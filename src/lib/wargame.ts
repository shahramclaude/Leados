// Wargaming engine — TypeScript transcription of the `LEADOS.wargame` object
// supplied verbatim as runnable pseudocode in the task's pasted "pt-O" brief.
//
// PROVENANCE: the task prompt provided working JavaScript for this module.
// That code's authorship belongs to the pasted spec, not to this session and
// not to github.com/wbweve/Leados — nothing resembling `buildCompetitiveLandscape`,
// `runScenario`, "blueTeam/redTeams/greenTeam", or any wargaming module was found
// anywhere in that repo's file tree or in the files actually fetched this
// session (see AI-SESSION-LOG.md). This file is a direct, mechanical port of
// the pasted logic into typed TS against this app's own event/store model —
// not a reimplementation from a different verified source, and not a claim
// that the pasted brief is itself real LeadOS history.
//
// DISCLOSED GAP: the pasted brief ends with a bare heading, "Rules R145–R160
// (Wargaming Domain)", and supplies no rule text under it. No such rules are
// invented here — see About / Provenance in the app.
import type { Projection } from "./types";
import * as engine from "./engine";

export interface Competitor {
  id: string;
  name: string;
  actions: any[];
  categories: string[];
  recentActions: any[];
  actionVelocity: number;
  mostRecentAction: any;
  unansweredActions: any[];
  estimatedMovePatterns: { dominantCategory: string; actionsLast90d: number; estimatedNextMove: string | null; label: string } | null;
}

export interface Landscape {
  blueTeam: any;
  redTeams: Competitor[];
  greenTeam: any;
  label: string;
  generatedAt: string;
}

export interface Scenario {
  name: string;
  trigger: string;
  blueMove: string;
}

function latestMetric(P: Projection, metricName: string): number | null {
  const ev = P.state.events
    .filter((e) => ["fin.kpi.logged", "product.metric.logged", "cs.nps.logged"].includes(e.type))
    .filter((e) => e.data.metric === metricName || e.data.name === metricName)
    .sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  return ev ? ev.data.value : null;
}

function computeTechDebtScore(P: Projection): number {
  const resolved = new Set(P.state.events.filter((e) => e.type === "rd.tech.debt.resolved").map((e) => e.data.debtId));
  return P.state.events
    .filter((e) => e.type === "rd.tech.debt.logged" && !resolved.has(e.id))
    .reduce((a, e) => a + (e.data.severity || 3) * (e.data.effort || 3), 0);
}

function computePipelineValue(P: Projection): number {
  return (P.openDeals || []).reduce((a, d) => a + (d.value || 0), 0);
}

function computeWinRate(P: Projection, today: string): number | null {
  const wins = P.state.events.filter((e) => e.type === "sales.deal.closed" && e.data.result === "won" && engine.days(e.ts, today) <= 90).length;
  const losses = P.state.events.filter((e) => e.type === "sales.deal.closed" && e.data.result === "lost" && engine.days(e.ts, today) <= 90).length;
  return wins + losses ? wins / (wins + losses) : null;
}

function computeVelocityMean(P: Projection, today: string): number | null {
  const sprints = P.state.events.filter((e) => e.type === "sprint.review" && engine.days(e.ts, today) <= 90);
  return sprints.length ? sprints.reduce((a, e) => a + (e.data.velocity_actual || 0), 0) / sprints.length : null;
}

function latestChurnRate(P: Projection): number | null {
  const latest = P.state.events.filter((e) => e.type === "cs.churn.logged").sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  if (!latest || !latest.data.total) return null;
  return latest.data.churned / latest.data.total;
}

function topCustomerPains(P: Projection): string[] {
  return P.state.events
    .filter((e) => e.type === "customer.pain" && !P.state.events.some((r) => r.type === "customer.pain.resolved" && r.data.painId === e.id))
    .sort((a, b) => (b.data.frequency || 1) * (b.data.severity || 1) - (a.data.frequency || 1) * (a.data.severity || 1))
    .slice(0, 5)
    .map((e) => e.data.title);
}

function reasonTally(P: Projection, result: string, today: string): Record<string, number> {
  return P.state.events
    .filter((e) => e.type === "win.loss.logged" && e.data.result === result && engine.days(e.ts, today) <= 180)
    .reduce((a: Record<string, number>, e) => {
      a[e.data.primary_reason] = (a[e.data.primary_reason] || 0) + 1;
      return a;
    }, {});
}

function inferMovePatterns(actions: any[], today: string) {
  if (actions.length < 3) return null;
  const categories: Record<string, number> = {};
  actions.forEach((a) => {
    categories[a.data.category] = (categories[a.data.category] || 0) + 1;
  });
  const topCategory = Object.entries(categories).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];
  const last90 = actions.filter((a) => engine.days(a.ts, today) <= 90).length;
  return {
    dominantCategory: topCategory,
    actionsLast90d: last90,
    estimatedNextMove: topCategory ? `Next move likely in ${topCategory} (dominant pattern)` : null,
    label: `Pattern inferred from ${actions.length} logged competitor actions. Labeled: extrapolation from limited data.`,
  };
}

function categorizeMoveType(move: string): string {
  const m = move.toLowerCase();
  if (m.includes("pric") || m.includes("discount")) return "pricing_change";
  if (m.includes("launch") || m.includes("product") || m.includes("feature")) return "product_launch";
  if (m.includes("enter") || m.includes("expan") || m.includes("new market")) return "market_entry";
  return "general";
}

function probableResponse(blueMove: string, competitor: Competitor) {
  const responseMatrix: Record<string, Record<string, number>> = {
    pricing_change: { pricing: 0.8, product: 0.4, marketing: 0.6 },
    product_launch: { product: 0.7, pricing: 0.5, hiring: 0.4 },
    market_entry: { pricing: 0.6, partnership: 0.5, marketing: 0.7 },
  };
  const blueMoveType = categorizeMoveType(blueMove);
  const responseProbs = responseMatrix[blueMoveType] || {};
  const patterns = competitor.estimatedMovePatterns;
  if (!patterns || !patterns.dominantCategory) return null;
  const domCat = patterns.dominantCategory;
  const prob = responseProbs[domCat] ?? 0.3;
  if (prob < 0.3) return null;
  return {
    action: `${competitor.name} likely responds in ${domCat} (probability: ${Math.round(prob * 100)}%)`,
    probability: prob,
    rationale: `${competitor.name} has historically favored ${domCat} moves (${patterns.actionsLast90d} actions in last 90d).`,
  };
}

function analyzeMove(move: string, blueTeam: any, P: Projection, today: string) {
  const findings = engine.run(P, today).findings;
  const vulnerabilities = findings.filter((f) => f.sev >= 4).map((f) => f.title);
  return {
    move,
    internalReadiness: vulnerabilities.length === 0 ? "HIGH" : vulnerabilities.length <= 2 ? "MEDIUM" : "LOW",
    vulnerabilitiesDuringMove: vulnerabilities,
    resourceCost: `estimated from current capacity (headcount: ${blueTeam.capabilities.headcount}, runway: ${blueTeam.capabilities.runway} months)`,
    label: "Move analysis from internal data only.",
  };
}

function customerReaction(_blueMove: string, greenTeam: any) {
  return {
    action: `Customer response based on ${greenTeam.topPains?.length || 0} logged pain points`,
    sentiment: (greenTeam.satisfaction || 0) > 40 ? "POSITIVE_LEAN" : "CAUTIOUS",
    estimatedChurnDelta: -0.5,
  };
}

function generateCounterOptions() {
  return [
    { option: "ACCELERATE", description: "Move faster than the competition can respond", risk: "HIGH — requires full team capacity", enabler: "Resolve active capacity constraints first" },
    { option: "DIFFERENTIATE", description: "Compete on a dimension competitors cannot easily match", risk: "MEDIUM — requires identifying genuine differentiation", enabler: "Use customer voice synthesis to identify unmet needs" },
    { option: "PARTNER", description: "Form a blocking partnership that changes the competitive equation", risk: "MEDIUM — partnership risk if partnership goes dormant", enabler: "Map existing partnership relationships first" },
    { option: "WAIT", description: "Let competitors exhaust resources and then respond", risk: "LOW SHORT-TERM — HIGH LONG-TERM if market share erodes", enabler: "Monitor with market.signal events" },
  ];
}

function wargameVerdict(log: any[], landscape: Landscape) {
  const turns = log.length;
  const redResponses = log.filter((l) => l.actor?.startsWith("RED")).length;
  const customerSentiment = log.find((l) => l.actor === "GREEN")?.sentiment || "UNKNOWN";
  return {
    summary: `${turns} turns simulated. ${redResponses} competitor response(s) modeled. Customer sentiment: ${customerSentiment}.`,
    keyRisk: `Competitor response uncertainty — only ${landscape.redTeams.length} competitor(s) in intelligence base. Unknown players may respond.`,
    label: "Wargame verdict from simulated turns. All probabilities are estimates from historical patterns, not predictions.",
  };
}

export function buildCompetitiveLandscape(P: Projection, today: string): Landscape {
  const blueTeam = {
    id: "blue",
    name: "Your Organization",
    capabilities: {
      runway: (() => {
        const ev = P.state.events.filter((e) => e.type === "fin.runway.logged").sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
        return ev ? ev.data.months : "unknown";
      })(),
      grossMargin: latestMetric(P, "gross_margin_pct"),
      headcount: P.people.filter((p) => !p.archived).length,
      openRoles: P.state.events.filter((e) => e.type === "hr.headcount.planned" && engine.days(e.ts, today) <= 90).length,
      attritionRisk: P.state.events.filter((e) => e.type === "hr.attrition.logged" && engine.days(e.ts, today) <= 60).length,
      techDebtScore: computeTechDebtScore(P),
      experimentVelocity: P.state.events.filter((e) => e.type === "rd.experiment.result" && engine.days(e.ts, today) <= 90).length,
      pipelineValue: computePipelineValue(P),
      winRate: computeWinRate(P, today),
      nps: latestMetric(P, "nps_score"),
      velocity: computeVelocityMean(P, today),
      incidentRate: P.state.events.filter((e) => e.type === "ops.incident.logged" && engine.days(e.ts, today) <= 90).length,
    },
    patents: P.state.events.filter((e) => e.type === "rd.patent.logged").length,
    partnerships: P.state.events.filter((e) => e.type === "partnership.logged" && e.data.status === "active").length,
    activeFindings: engine.run(P, today).findings.slice(0, 10),
    currentObjectives: (P.openOkrs || []).map((o) => o.objective),
  };

  const competitorsMap: Record<string, Competitor> = {};
  P.state.events
    .filter((e) => e.type === "competitor.logged")
    .forEach((ev) => {
      const name = ev.data.name;
      if (!competitorsMap[name]) {
        competitorsMap[name] = {
          id: "red:" + name.replace(/\s+/g, "-").toLowerCase(),
          name,
          actions: [],
          categories: [],
          recentActions: [],
          actionVelocity: 0,
          mostRecentAction: null,
          unansweredActions: [],
          estimatedMovePatterns: null,
        };
      }
      competitorsMap[name].actions.push(ev);
      if (!competitorsMap[name].categories.includes(ev.data.category)) {
        competitorsMap[name].categories.push(ev.data.category);
      }
    });

  const redTeams: Competitor[] = Object.values(competitorsMap).map((comp) => {
    const sorted = [...comp.actions].sort((a, b) => (b.ts > a.ts ? 1 : -1));
    return {
      ...comp,
      recentActions: comp.actions.filter((a) => engine.days(a.ts, today) <= 90).sort((a, b) => (b.ts > a.ts ? 1 : -1)),
      actionVelocity: comp.actions.filter((a) => engine.days(a.ts, today) <= 30).length,
      mostRecentAction: sorted[0] || null,
      unansweredActions: comp.actions.filter(
        (a) => a.data.response_needed && !P.state.events.some((r) => r.type === "competitor.response" && r.data.competitorId === a.id)
      ),
      estimatedMovePatterns: inferMovePatterns(comp.actions, today),
    };
  });

  const greenTeam = {
    id: "green",
    name: "Customer Base",
    satisfaction: latestMetric(P, "nps_score"),
    churnRate: latestChurnRate(P),
    topPains: topCustomerPains(P),
    winReasons: reasonTally(P, "win", today),
    lossReasons: reasonTally(P, "loss", today),
    atRiskAccounts: P.state.events.filter((e) => e.type === "cs.health.logged" && e.data.score <= 2 && engine.days(e.ts, today) <= 30).length,
  };

  return {
    blueTeam,
    redTeams,
    greenTeam,
    label:
      "Competitive landscape from your logged intelligence data. Blue team: your event log. " +
      "Red team: competitor.logged events. Green team: cs.* and win.loss.logged events. " +
      "All external data is your own intelligence, not market research.",
    generatedAt: today,
  };
}

export function runScenario(scenario: Scenario, landscape: Landscape, P: Projection, today: string) {
  const { name, trigger, blueMove } = scenario;
  const log: any[] = [];

  log.push({ turn: 0, actor: "SITUATION", action: trigger, rationale: "Scenario trigger: " + name });

  const blueMoveAnalysis = analyzeMove(blueMove, landscape.blueTeam, P, today);
  log.push({ turn: 1, actor: "BLUE", action: blueMove, analysis: blueMoveAnalysis, resources: blueMoveAnalysis.resourceCost });

  landscape.redTeams.forEach((red) => {
    const resp = probableResponse(blueMove, red);
    if (resp) {
      log.push({ turn: 2, actor: "RED:" + red.name, action: resp.action, probability: resp.probability, rationale: resp.rationale });
    }
  });

  const reaction = customerReaction(blueMove, landscape.greenTeam);
  log.push({ turn: 3, actor: "GREEN", action: reaction.action, sentiment: reaction.sentiment, churnImpact: reaction.estimatedChurnDelta });

  const counterOptions = generateCounterOptions();
  log.push({ turn: 4, actor: "BLUE", type: "DECISION_POINT", options: counterOptions, label: "Human judgment required. The wargame has produced these options." });

  return {
    scenario: name,
    log,
    verdict: wargameVerdict(log, landscape),
    label:
      "Wargame simulation. All red team responses are probabilistic inferences from competitor.logged patterns, not confirmed intelligence. " +
      "Customer reactions are extrapolated from cs.* and win.loss.logged data.",
  };
}
