import type { Domain, Hypothesis, RuleEvaluation, Severity } from "@/lib/types";
import type { BrainProjection } from "@/lib/eventBrain";
import { computeOKRHealth } from "@/lib/strategicIntelligence";
import { runScenarioSurveillance } from "@/lib/strategicIntelligence";
import { computeUnitEconomics, computeCapitalEfficiency, runMonteCarloRunway } from "@/lib/financialOS";
import { buildExecutionReport } from "@/lib/executionIntelligence";
import { latestFinance } from "@/lib/eventBrain";

// ─────────────────────────────────────────────────────────────────────────
// ruleEngine — 48 rules, 6 per domain across all 8 domains. Each rule is a
// pure function of a shared RuleContext (itself a pure function of the
// projection). DESIGN PARAMETER: severity ratio tiers — >=2x threshold
// "critical", >=1.5x "high", >=1.2x "medium", else "low" (only when firing).
// DESIGN PARAMETER: a firing rule is "calibrating" rather than "active"
// until it has accumulated >= 3 resolved hypotheses.
// ─────────────────────────────────────────────────────────────────────────

export interface RuleContext {
  projection: BrainProjection;
  now: Date;
  okr: ReturnType<typeof computeOKRHealth>;
  scenarios: ReturnType<typeof runScenarioSurveillance>;
  execution: ReturnType<typeof buildExecutionReport>;
  financeSnapshot: ReturnType<typeof latestFinance>;
  unitEconomics: ReturnType<typeof computeUnitEconomics> | null;
  capitalEfficiency: ReturnType<typeof computeCapitalEfficiency> | null;
  runway: ReturnType<typeof runMonteCarloRunway> | null;
  hypothesesByRule: Map<string, Hypothesis[]>;
}

export function buildRuleContext(projection: BrainProjection, now: Date): RuleContext {
  const okr = computeOKRHealth(projection.goals, now);
  const scenarios = runScenarioSurveillance(projection);
  const execution = buildExecutionReport(projection, now);
  const financeSnapshot = latestFinance(projection);
  const unitEconomics = financeSnapshot ? computeUnitEconomics(financeSnapshot) : null;
  const capitalEfficiency = financeSnapshot && unitEconomics ? computeCapitalEfficiency(financeSnapshot, unitEconomics) : null;
  const runway = financeSnapshot ? runMonteCarloRunway(financeSnapshot.cash, financeSnapshot.monthlyBurn) : null;

  const hypothesesByRule = new Map<string, Hypothesis[]>();
  for (const h of projection.hypotheses) {
    const list = hypothesesByRule.get(h.ruleId) ?? [];
    list.push({
      id: h.id,
      ruleId: h.ruleId,
      entityId: h.entityId,
      createdAt: h.createdAt,
      status: h.status,
      confidence: h.confidence,
      resolveBy: h.resolveBy,
      statement: h.statement,
    });
    hypothesesByRule.set(h.ruleId, list);
  }

  return { projection, now, okr, scenarios, execution, financeSnapshot, unitEconomics, capitalEfficiency, runway, hypothesesByRule };
}

interface EvalOutcome {
  firing: boolean;
  value: number;
  threshold: number;
  comparator: ">" | "<";
  unit: string;
}

interface RuleSpec {
  id: string;
  domain: Domain;
  name: string;
  description: string;
  firesWhen: string;
  resolvesWhen: string;
  playbookId: string;
  evaluate: (ctx: RuleContext) => EvalOutcome;
}

function gt(value: number, threshold: number, unit = ""): EvalOutcome {
  return { firing: value > threshold, value, threshold, comparator: ">", unit };
}
function lt(value: number, threshold: number, unit = ""): EvalOutcome {
  return { firing: value < threshold, value, threshold, comparator: "<", unit };
}

function maxFlightRisk(ctx: RuleContext): number {
  return ctx.projection.people.reduce((a, p) => Math.max(a, p.flightRisk), 0);
}
function avgFlightRisk(ctx: RuleContext): number {
  const list = ctx.projection.people;
  return list.length ? list.reduce((a, p) => a + p.flightRisk, 0) / list.length : 0;
}
function countHighRisk(ctx: RuleContext): number {
  return ctx.projection.people.filter((p) => p.flightRisk > 0.6).length;
}
function avgPerformance(ctx: RuleContext): number {
  const list = ctx.projection.people;
  return list.length ? list.reduce((a, p) => a + p.performance, 0) / list.length : 0;
}
function lowPotentialHighPerf(ctx: RuleContext): number {
  return ctx.projection.people.filter((p) => p.performance > 75 && p.potential < 40).length;
}
function exitSignalDensity(ctx: RuleContext): number {
  const total = ctx.projection.people.reduce((a, p) => a + p.exitSignals.length, 0);
  return ctx.projection.people.length ? total / ctx.projection.people.length : 0;
}

function domainProjects(ctx: RuleContext, domain: Domain) {
  return ctx.execution.projects.filter((p) => p.domain === domain);
}
function domainOpenBlockers(ctx: RuleContext, domain: Domain, severity?: Severity) {
  return domainProjects(ctx, domain).reduce(
    (a, p) => a + p.blockers.filter((b) => !b.resolved && (!severity || b.severity === severity)).length,
    0
  );
}
function domainAvgConfidence(ctx: RuleContext, domain: Domain) {
  const list = domainProjects(ctx, domain);
  return list.length ? list.reduce((a, p) => a + p.confidence, 0) / list.length : 1;
}
function domainOverdue(ctx: RuleContext, domain: Domain) {
  return domainProjects(ctx, domain).reduce((a, p) => a + p.milestones.filter((m) => m.overdue && !m.completed).length, 0);
}

function metricLatest(ctx: RuleContext, key: string, fallback = 0): number {
  const series = ctx.projection.metrics[key];
  return series && series.length ? series[series.length - 1].value : fallback;
}

function peopleRules(): RuleSpec[] {
  return [
    {
      id: "people.flight_risk_spike",
      domain: "people",
      name: "Flight Risk Spike",
      description: "Detects any individual whose flight risk score has crossed a critical threshold.",
      firesWhen: "max(person.flightRisk) > 0.6",
      resolvesWhen: "max(person.flightRisk) <= 0.6 for 14 consecutive days",
      playbookId: "retention_intervention",
      evaluate: (ctx) => gt(maxFlightRisk(ctx), 0.6),
    },
    {
      id: "people.org_wide_disengagement",
      domain: "people",
      name: "Org-Wide Disengagement",
      description: "Average flight risk across the whole roster is elevated, suggesting a systemic morale issue rather than an individual one.",
      firesWhen: "avg(person.flightRisk) > 0.35",
      resolvesWhen: "avg(person.flightRisk) <= 0.35",
      playbookId: "culture_pulse_check",
      evaluate: (ctx) => gt(avgFlightRisk(ctx), 0.35),
    },
    {
      id: "people.concentration_of_risk",
      domain: "people",
      name: "Concentration of Flight Risk",
      description: "A meaningful cluster of high-risk people (>0.6) exists simultaneously, raising the odds of a coordinated departure wave.",
      firesWhen: "count(flightRisk > 0.6) >= 2",
      resolvesWhen: "count(flightRisk > 0.6) < 2",
      playbookId: "retention_intervention",
      evaluate: (ctx) => gt(countHighRisk(ctx), 1),
    },
    {
      id: "people.performance_without_potential",
      domain: "people",
      name: "High Performer, Low Growth Track",
      description: "Strong current performers rated with low potential signal a succession and promotion-pipeline gap.",
      firesWhen: "count(performance>75 & potential<40) >= 1",
      resolvesWhen: "count(performance>75 & potential<40) == 0",
      playbookId: "nine_box_recalibration",
      evaluate: (ctx) => gt(lowPotentialHighPerf(ctx), 0),
    },
    {
      id: "people.exit_signal_density",
      domain: "people",
      name: "Exit Signal Density",
      description: "Average number of logged exit signals per person is climbing — an early-warning composite indicator.",
      firesWhen: "avg(exitSignals per person) > 0.5",
      resolvesWhen: "avg(exitSignals per person) <= 0.5",
      playbookId: "retention_intervention",
      evaluate: (ctx) => gt(exitSignalDensity(ctx), 0.5),
    },
    {
      id: "people.performance_decline",
      domain: "people",
      name: "Average Performance Decline",
      description: "Average performance score across the roster has dropped below a healthy baseline.",
      firesWhen: "avg(performance) < 55",
      resolvesWhen: "avg(performance) >= 55",
      playbookId: "culture_pulse_check",
      evaluate: (ctx) => lt(avgPerformance(ctx), 55),
    },
  ];
}

function financeRules(): RuleSpec[] {
  return [
    {
      id: "finance.runway_critical",
      domain: "finance",
      name: "Runway Below Critical Threshold",
      description: "Median Monte Carlo runway has fallen under 6 months.",
      firesWhen: "runway.p50 < 6 months",
      resolvesWhen: "runway.p50 >= 6 months",
      playbookId: "runway_extension",
      evaluate: (ctx) => lt(ctx.runway?.monteCarlo.p50 ?? 99, 6, "mo"),
    },
    {
      id: "finance.bankruptcy_risk",
      domain: "finance",
      name: "Near-Term Bankruptcy Risk",
      description: "Probability of running out of cash within one month exceeds a safety threshold.",
      firesWhen: "P(runway <= 1mo) > 0.05",
      resolvesWhen: "P(runway <= 1mo) <= 0.05",
      playbookId: "runway_extension",
      evaluate: (ctx) => gt(ctx.runway?.bankruptcyRisk ?? 0, 0.05),
    },
    {
      id: "finance.unit_economics_broken",
      domain: "finance",
      name: "Unit Economics Below Threshold",
      description: "LTV:CAC ratio has fallen below the minimum sustainable level.",
      firesWhen: "ltvCacRatio < 1.5",
      resolvesWhen: "ltvCacRatio >= 1.5",
      playbookId: "unit_economics_repair",
      evaluate: (ctx) => lt(ctx.unitEconomics?.ltvCacRatio ?? 10, 1.5),
    },
    {
      id: "finance.burn_multiple_high",
      domain: "finance",
      name: "Burn Multiple Elevated",
      description: "Burn multiple (net burn / net new ARR) indicates inefficient capital deployment.",
      firesWhen: "burnMultiple > 2",
      resolvesWhen: "burnMultiple <= 2",
      playbookId: "capital_efficiency_review",
      evaluate: (ctx) => gt(ctx.capitalEfficiency?.burnMultiple ?? 0, 2),
    },
    {
      id: "finance.gross_margin_erosion",
      domain: "finance",
      name: "Gross Margin Erosion",
      description: "Gross margin has fallen below a healthy SaaS benchmark.",
      firesWhen: "grossMarginPct < 0.6",
      resolvesWhen: "grossMarginPct >= 0.6",
      playbookId: "unit_economics_repair",
      evaluate: (ctx) => lt(ctx.financeSnapshot?.grossMarginPct ?? 1, 0.6),
    },
    {
      id: "finance.payback_period_long",
      domain: "finance",
      name: "CAC Payback Period Too Long",
      description: "Months to recoup customer acquisition cost exceeds a healthy threshold.",
      firesWhen: "paybackPeriodMonths > 18",
      resolvesWhen: "paybackPeriodMonths <= 18",
      playbookId: "unit_economics_repair",
      evaluate: (ctx) => gt(ctx.unitEconomics?.paybackPeriodMonths ?? 0, 18, "mo"),
    },
  ];
}

function strategyRules(): RuleSpec[] {
  return [
    {
      id: "strategy.okr_off_track",
      domain: "strategy",
      name: "OKRs Off Track",
      description: "One or more objectives are off-track relative to elapsed quarter time.",
      firesWhen: "count(objective.health == off_track) >= 1",
      resolvesWhen: "count(objective.health == off_track) == 0",
      playbookId: "okr_reset",
      evaluate: (ctx) => gt(ctx.okr.offTrack, 0),
    },
    {
      id: "strategy.team_health_low",
      domain: "strategy",
      name: "Team Health Score Low",
      description: "Composite OKR team health score has fallen below a healthy band.",
      firesWhen: "teamHealthScore < 50",
      resolvesWhen: "teamHealthScore >= 50",
      playbookId: "okr_reset",
      evaluate: (ctx) => lt(ctx.okr.teamHealthScore, 50),
    },
    {
      id: "strategy.scenario_activated",
      domain: "strategy",
      name: "Scenario Surveillance Activated",
      description: "One or more monitored metrics have deviated beyond the 2σ activation threshold.",
      firesWhen: "count(activatedScenarios) >= 1",
      resolvesWhen: "count(activatedScenarios) == 0",
      playbookId: "scenario_response",
      evaluate: (ctx) => gt(ctx.scenarios.length, 0),
    },
    {
      id: "strategy.critical_scenario",
      domain: "strategy",
      name: "Critical Scenario Deviation",
      description: "A monitored metric has deviated more than 4σ from baseline — a critical surveillance event.",
      firesWhen: "max(|sigma|) >= 4",
      resolvesWhen: "max(|sigma|) < 4",
      playbookId: "scenario_response",
      evaluate: (ctx) => gt(ctx.scenarios.reduce((a, s) => Math.max(a, Math.abs(s.sigma)), 0), 4),
    },
    {
      id: "strategy.velocity_negative",
      domain: "strategy",
      name: "Negative OKR Velocity",
      description: "At least one objective is moving backwards week over week.",
      firesWhen: "count(objective.velocity < 0) >= 1",
      resolvesWhen: "count(objective.velocity < 0) == 0",
      playbookId: "okr_reset",
      evaluate: (ctx) => gt(ctx.okr.objectives.filter((o) => o.velocity < 0).length, 0),
    },
    {
      id: "strategy.competitive_pressure",
      domain: "strategy",
      name: "Competitive Pressure Rising",
      description: "Competitor signal volume in the recent window suggests a response may be warranted.",
      firesWhen: "count(competitor.signals, last 14d) >= 3",
      resolvesWhen: "count(competitor.signals, last 14d) < 3",
      playbookId: "wargame_response",
      evaluate: (ctx) => {
        const windowMs = 14 * 86400000;
        const count = ctx.projection.competitors.reduce(
          (a, c) => a + c.signals.filter((s) => ctx.now.getTime() - new Date(s.ts).getTime() <= windowMs).length,
          0
        );
        return gt(count, 2);
      },
    },
  ];
}

function executionRules(): RuleSpec[] {
  return [
    {
      id: "execution.blocked_projects",
      domain: "execution",
      name: "Projects Blocked",
      description: "One or more projects are currently in a blocked state.",
      firesWhen: "count(project.status == blocked) >= 1",
      resolvesWhen: "count(project.status == blocked) == 0",
      playbookId: "blocker_escalation",
      evaluate: (ctx) => gt(ctx.execution.kpis.blockedProjects, 0),
    },
    {
      id: "execution.overdue_milestones",
      domain: "execution",
      name: "Overdue Milestones",
      description: "Milestones have passed their due date without completion.",
      firesWhen: "count(milestone.overdue) >= 1",
      resolvesWhen: "count(milestone.overdue) == 0",
      playbookId: "delivery_recovery",
      evaluate: (ctx) => gt(ctx.execution.kpis.overdueMilestones, 0),
    },
    {
      id: "execution.low_confidence",
      domain: "execution",
      name: "Average Delivery Confidence Low",
      description: "Average project confidence across the portfolio has fallen below a healthy level.",
      firesWhen: "avg(project.confidence) < 0.6",
      resolvesWhen: "avg(project.confidence) >= 0.6",
      playbookId: "delivery_recovery",
      evaluate: (ctx) => lt(ctx.execution.kpis.avgConfidence, 0.6),
    },
    {
      id: "execution.momentum_stalled",
      domain: "execution",
      name: "Delivery Momentum Stalled",
      description: "Completed-to-pending milestone ratio in the last 14 days indicates stalled delivery.",
      firesWhen: "momentumIndex < 0.8",
      resolvesWhen: "momentumIndex >= 0.8",
      playbookId: "delivery_recovery",
      evaluate: (ctx) => lt(ctx.execution.momentum.momentumIndex, 0.8),
    },
    {
      id: "execution.critical_path_risk",
      domain: "execution",
      name: "Critical Path Bottleneck",
      description: "The critical path contains a project with below-average confidence, risking the whole chain's delivery date.",
      firesWhen: "bottleneck project confidence < 0.6",
      resolvesWhen: "bottleneck project confidence >= 0.6",
      playbookId: "delivery_recovery",
      evaluate: (ctx) => {
        const bn = ctx.execution.criticalPath.bottleneck;
        const proj = ctx.execution.projects.find((p) => p.id === bn);
        return lt(proj?.confidence ?? 1, 0.6);
      },
    },
    {
      id: "execution.open_blocker_backlog",
      domain: "execution",
      name: "Open Blocker Backlog Growing",
      description: "Total number of unresolved blockers across the portfolio exceeds a manageable threshold.",
      firesWhen: "count(openBlockers) > 3",
      resolvesWhen: "count(openBlockers) <= 3",
      playbookId: "blocker_escalation",
      evaluate: (ctx) => gt(ctx.execution.kpis.openBlockers, 3),
    },
  ];
}

function rdRules(): RuleSpec[] {
  return [
    {
      id: "rd.blocked_projects",
      domain: "rd",
      name: "R&D Projects Blocked",
      description: "Engineering/product workstreams are blocked, risking roadmap slippage.",
      firesWhen: "count(rd project blockers, open) >= 1",
      resolvesWhen: "count(rd project blockers, open) == 0",
      playbookId: "rd_unblock",
      evaluate: (ctx) => gt(domainOpenBlockers(ctx, "rd"), 0),
    },
    {
      id: "rd.confidence_low",
      domain: "rd",
      name: "R&D Delivery Confidence Low",
      description: "Average confidence across R&D projects has dropped below a healthy band.",
      firesWhen: "avg(rd project confidence) < 0.6",
      resolvesWhen: "avg(rd project confidence) >= 0.6",
      playbookId: "rd_unblock",
      evaluate: (ctx) => lt(domainAvgConfidence(ctx, "rd"), 0.6),
    },
    {
      id: "rd.overdue_milestones",
      domain: "rd",
      name: "R&D Milestones Overdue",
      description: "R&D milestones have slipped past their committed date.",
      firesWhen: "count(rd milestone.overdue) >= 1",
      resolvesWhen: "count(rd milestone.overdue) == 0",
      playbookId: "rd_unblock",
      evaluate: (ctx) => gt(domainOverdue(ctx, "rd"), 0),
    },
    {
      id: "rd.critical_blocker",
      domain: "rd",
      name: "Critical Severity R&D Blocker",
      description: "A critical-severity blocker exists on an R&D workstream.",
      firesWhen: "count(rd blocker.severity == critical, open) >= 1",
      resolvesWhen: "count(rd blocker.severity == critical, open) == 0",
      playbookId: "rd_unblock",
      evaluate: (ctx) => gt(domainOpenBlockers(ctx, "rd", "critical"), 0),
    },
    {
      id: "rd.support_ticket_surge",
      domain: "rd",
      name: "Support Ticket Volume Surge",
      description: "Support ticket volume has deviated significantly above baseline, often a proxy for quality regressions.",
      firesWhen: "support_ticket_volume > 1.3x baseline(120)",
      resolvesWhen: "support_ticket_volume <= 1.3x baseline(120)",
      playbookId: "quality_regression_review",
      evaluate: (ctx) => gt(metricLatest(ctx, "support_ticket_volume", 0), 156),
    },
    {
      id: "rd.engineering_efficiency_low",
      domain: "rd",
      name: "Engineering Efficiency Low",
      description: "Revenue generated per dollar of R&D headcount cost is below a healthy multiple.",
      firesWhen: "engineeringEfficiency < 2",
      resolvesWhen: "engineeringEfficiency >= 2",
      playbookId: "capital_efficiency_review",
      evaluate: (ctx) => lt(ctx.capitalEfficiency?.engineeringEfficiency ?? 10, 2),
    },
  ];
}

function salesRules(): RuleSpec[] {
  return [
    {
      id: "sales.pipeline_coverage_low",
      domain: "sales",
      name: "Pipeline Coverage Below Target",
      description: "Pipeline coverage ratio has fallen below the 3x rule-of-thumb minimum.",
      firesWhen: "pipeline_coverage < 3",
      resolvesWhen: "pipeline_coverage >= 3",
      playbookId: "pipeline_generation_sprint",
      evaluate: (ctx) => lt(metricLatest(ctx, "pipeline_coverage", 3.2), 3, "x"),
    },
    {
      id: "sales.deal_cycle_lengthening",
      domain: "sales",
      name: "Deal Cycle Lengthening",
      description: "Average deal cycle length has crept above baseline, suggesting buyer hesitation or process friction.",
      firesWhen: "deal_cycle_days > 1.2x baseline(34)",
      resolvesWhen: "deal_cycle_days <= 1.2x baseline(34)",
      playbookId: "sales_process_review",
      evaluate: (ctx) => gt(metricLatest(ctx, "deal_cycle_days", 34), 40.8, "d"),
    },
    {
      id: "sales.churn_elevated",
      domain: "sales",
      name: "Logo Churn Elevated",
      description: "Logo churn rate has risen above a healthy monthly benchmark.",
      firesWhen: "logo_churn_rate > 0.03",
      resolvesWhen: "logo_churn_rate <= 0.03",
      playbookId: "churn_response",
      evaluate: (ctx) => gt(metricLatest(ctx, "logo_churn_rate", 0.02), 0.03),
    },
    {
      id: "sales.nps_declining",
      domain: "sales",
      name: "NPS Below Healthy Band",
      description: "Net Promoter Score has fallen below a defensible customer-advocacy baseline.",
      firesWhen: "nps < 30",
      resolvesWhen: "nps >= 30",
      playbookId: "customer_health_review",
      evaluate: (ctx) => lt(metricLatest(ctx, "nps", 42), 30),
    },
    {
      id: "sales.cac_rising",
      domain: "sales",
      name: "CAC Rising Faster Than LTV",
      description: "Cost of acquisition is rising relative to lifetime value.",
      firesWhen: "ltvCacRatio < 2",
      resolvesWhen: "ltvCacRatio >= 2",
      playbookId: "unit_economics_repair",
      evaluate: (ctx) => lt(ctx.unitEconomics?.ltvCacRatio ?? 10, 2),
    },
    {
      id: "sales.new_logo_growth_stalled",
      domain: "sales",
      name: "New Logo Growth Stalled",
      description: "ARR growth rate has fallen below a healthy threshold for a growth-stage company.",
      firesWhen: "arr_growth_rate < 0.03",
      resolvesWhen: "arr_growth_rate >= 0.03",
      playbookId: "pipeline_generation_sprint",
      evaluate: (ctx) => lt(metricLatest(ctx, "arr_growth_rate", 0.08), 0.03),
    },
  ];
}

function knowledgeRules(): RuleSpec[] {
  return [
    {
      id: "knowledge.open_hypotheses_backlog",
      domain: "knowledge",
      name: "Open Hypothesis Backlog",
      description: "A growing number of open hypotheses have not been resolved, reducing institutional learning velocity.",
      firesWhen: "count(hypothesis.status == open) > 5",
      resolvesWhen: "count(hypothesis.status == open) <= 5",
      playbookId: "hypothesis_resolution_sprint",
      evaluate: (ctx) => gt(ctx.projection.hypotheses.filter((h) => h.status === "open").length, 5),
    },
    {
      id: "knowledge.low_confirmation_rate",
      domain: "knowledge",
      name: "Low Hypothesis Confirmation Rate",
      description: "The ratio of confirmed to resolved hypotheses suggests rules may be over-sensitive.",
      firesWhen: "confirmationRate < 0.4 (n>=5)",
      resolvesWhen: "confirmationRate >= 0.4",
      playbookId: "rule_recalibration",
      evaluate: (ctx) => {
        const resolved = ctx.projection.hypotheses.filter((h) => h.status !== "open");
        const confirmed = resolved.filter((h) => h.status === "confirmed").length;
        const rate = resolved.length >= 5 ? confirmed / resolved.length : 1;
        return lt(rate, 0.4);
      },
    },
    {
      id: "knowledge.root_cause_recurrence",
      domain: "knowledge",
      name: "Recurring Root Cause Pattern",
      description: "The same root cause has been logged multiple times, indicating an unaddressed systemic issue.",
      firesWhen: "max(rootCause recurrence) >= 2",
      resolvesWhen: "max(rootCause recurrence) < 2",
      playbookId: "systemic_fix",
      evaluate: (ctx) => {
        const counts = new Map<string, number>();
        for (const rc of ctx.projection.rootCauses) counts.set(rc.rootCause, (counts.get(rc.rootCause) ?? 0) + 1);
        const max = Math.max(0, ...counts.values());
        return gt(max, 1);
      },
    },
    {
      id: "knowledge.stale_playbooks",
      domain: "knowledge",
      name: "Playbooks Underused",
      description: "Few or no playbooks have been invoked recently despite active findings, suggesting institutional memory is not being applied.",
      firesWhen: "playbook.used events == 0 while findings exist",
      resolvesWhen: "playbook.used events > 0",
      playbookId: "playbook_adoption_push",
      evaluate: (ctx) => {
        const used = ctx.projection.events.filter((e) => e.type === "playbook.used").length;
        const findingsProxy = ctx.scenarios.length + ctx.okr.offTrack + ctx.execution.kpis.blockedProjects;
        return lt(used, 1) && findingsProxy > 0 ? gt(1, 0) : gt(0, 0);
      },
    },
    {
      id: "knowledge.decision_ledger_stale",
      domain: "knowledge",
      name: "Decision Ledger Stale",
      description: "Open decisions have accumulated without resolution, risking institutional drift.",
      firesWhen: "count(decision.outcome == null) > 3",
      resolvesWhen: "count(decision.outcome == null) <= 3",
      playbookId: "decision_review_cadence",
      evaluate: (ctx) => gt(ctx.projection.decisions.filter((d) => !d.outcome).length, 3),
    },
    {
      id: "knowledge.confidence_decay_unmonitored",
      domain: "knowledge",
      name: "Confidence Decay Unmonitored",
      description: "A large share of hypotheses are approaching their resolve-by date without resolution.",
      firesWhen: "count(open & resolveBy <= now+3d) >= 1",
      resolvesWhen: "count(open & resolveBy <= now+3d) == 0",
      playbookId: "hypothesis_resolution_sprint",
      evaluate: (ctx) => {
        const soon = ctx.projection.hypotheses.filter(
          (h) => h.status === "open" && new Date(h.resolveBy).getTime() - ctx.now.getTime() <= 3 * 86400000
        ).length;
        return gt(soon, 0);
      },
    },
  ];
}

function manufacturingRules(): RuleSpec[] {
  return [
    {
      id: "manufacturing.blocked_lines",
      domain: "manufacturing",
      name: "Manufacturing Workstreams Blocked",
      description: "Manufacturing/operations projects are blocked.",
      firesWhen: "count(manufacturing project blockers, open) >= 1",
      resolvesWhen: "count(manufacturing project blockers, open) == 0",
      playbookId: "ops_unblock",
      evaluate: (ctx) => gt(domainOpenBlockers(ctx, "manufacturing"), 0),
    },
    {
      id: "manufacturing.confidence_low",
      domain: "manufacturing",
      name: "Manufacturing Delivery Confidence Low",
      description: "Average confidence across manufacturing/ops projects has dropped.",
      firesWhen: "avg(manufacturing project confidence) < 0.6",
      resolvesWhen: "avg(manufacturing project confidence) >= 0.6",
      playbookId: "ops_unblock",
      evaluate: (ctx) => lt(domainAvgConfidence(ctx, "manufacturing"), 0.6),
    },
    {
      id: "manufacturing.overdue_milestones",
      domain: "manufacturing",
      name: "Manufacturing Milestones Overdue",
      description: "Operational milestones have slipped past committed dates.",
      firesWhen: "count(manufacturing milestone.overdue) >= 1",
      resolvesWhen: "count(manufacturing milestone.overdue) == 0",
      playbookId: "ops_unblock",
      evaluate: (ctx) => gt(domainOverdue(ctx, "manufacturing"), 0),
    },
    {
      id: "manufacturing.critical_blocker",
      domain: "manufacturing",
      name: "Critical Severity Operations Blocker",
      description: "A critical-severity blocker exists on a manufacturing/ops workstream.",
      firesWhen: "count(manufacturing blocker.severity == critical, open) >= 1",
      resolvesWhen: "count(manufacturing blocker.severity == critical, open) == 0",
      playbookId: "ops_unblock",
      evaluate: (ctx) => gt(domainOpenBlockers(ctx, "manufacturing", "critical"), 0),
    },
    {
      id: "manufacturing.headcount_growth_outpacing",
      domain: "manufacturing",
      name: "Headcount Growth Outpacing Plan",
      description: "Headcount growth rate is running hot relative to baseline, risking onboarding and quality debt.",
      firesWhen: "headcount_growth_rate > 1.5x baseline(0.03)",
      resolvesWhen: "headcount_growth_rate <= 1.5x baseline(0.03)",
      playbookId: "scaling_governance_review",
      evaluate: (ctx) => gt(metricLatest(ctx, "headcount_growth_rate", 0.03), 0.045),
    },
    {
      id: "manufacturing.capacity_risk",
      domain: "manufacturing",
      name: "Capacity Risk from Project Load",
      description: "Number of active manufacturing/ops projects exceeds a safe concurrent-delivery threshold.",
      firesWhen: "count(manufacturing active projects) > 3",
      resolvesWhen: "count(manufacturing active projects) <= 3",
      playbookId: "ops_unblock",
      evaluate: (ctx) => gt(domainProjects(ctx, "manufacturing").filter((p) => p.status !== "done").length, 3),
    },
  ];
}

export const RULE_SPECS: RuleSpec[] = [
  ...peopleRules(),
  ...financeRules(),
  ...strategyRules(),
  ...executionRules(),
  ...rdRules(),
  ...salesRules(),
  ...knowledgeRules(),
  ...manufacturingRules(),
];

function severityFromRatio(ratio: number): Severity {
  if (ratio >= 2) return "critical";
  if (ratio >= 1.5) return "high";
  if (ratio >= 1.2) return "medium";
  return "low";
}

export function evaluateRule(spec: RuleSpec, ctx: RuleContext): RuleEvaluation {
  const outcome = spec.evaluate(ctx);
  const ratio =
    outcome.comparator === ">"
      ? outcome.value / (outcome.threshold || 1e-6)
      : (outcome.threshold || 1e-6) / (outcome.value || 1e-6);
  const severity = outcome.firing ? severityFromRatio(Math.max(1, ratio)) : null;
  const confidence = outcome.firing ? Math.max(0.3, Math.min(0.97, 0.4 + (ratio - 1) * 0.3)) : 0.15;
  const history = ctx.hypothesesByRule.get(spec.id) ?? [];
  const resolvedCount = history.filter((h) => h.status !== "open").length;
  const status: RuleEvaluation["status"] = !outcome.firing ? "inactive" : resolvedCount < 3 ? "calibrating" : "active";
  const scoreMath = `${outcome.value.toFixed(3)}${outcome.unit} ${outcome.comparator} ${outcome.threshold.toFixed(3)}${outcome.unit} → ${
    outcome.firing ? `ratio ${ratio.toFixed(2)}x` : "within bounds"
  }`;
  const basis = `${spec.firesWhen}. Evaluated against current projection snapshot at ${ctx.now.toISOString()}.`;

  return {
    ruleId: spec.id,
    domain: spec.domain,
    name: spec.name,
    description: spec.description,
    firesWhen: spec.firesWhen,
    resolvesWhen: spec.resolvesWhen,
    status,
    firing: outcome.firing,
    severity,
    confidence,
    scoreMath,
    basis,
    playbookId: spec.playbookId,
  };
}

export function runRuleEngine(ctx: RuleContext): RuleEvaluation[] {
  return RULE_SPECS.map((spec) => evaluateRule(spec, ctx));
}
