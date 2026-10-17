// Original, disclosed-fabricated findings engine for LeadOS pt-O.
//
// This is NOT a port of any rule engine found in github.com/wbweve/Leados.
// The real repo's own `src/lib/engine.ts` (verified this session, see
// AI-SESSION-LOG.md) is a separate, 6-rule, differently-scoped module tied
// to that repo's own synthetic rule catalog. This file is written from
// scratch to give the pt-O wargaming engine something real to call for
// `LEADOS.engine.run(P, today)` / `LEADOS.engine._days(...)`, matching the
// call signatures used in the task's pasted pt-O spec.
import type { Finding, Projection } from "./types";
import { daysBetween } from "./format";

export function days(ts: string, today: string): number {
  return daysBetween(ts, today);
}

function latestMetricValue(P: Projection, metric: string): number | null {
  const ev = P.state.events
    .filter((e) => e.type === "fin.kpi.logged" && e.data.metric === metric)
    .sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  return ev ? ev.data.value : null;
}

export function run(P: Projection, today: string): { findings: Finding[] } {
  const findings: Finding[] = [];
  const within = (ts: string, n: number) => days(ts, today) <= n;

  // R-RUNWAY
  const runwayEv = P.state.events.filter((e) => e.type === "fin.runway.logged").sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  const runway = runwayEv?.data.months as number | undefined;
  if (runway !== undefined && runway < 6) {
    findings.push({ id: "R-RUNWAY", title: `Runway critical (${runway.toFixed(1)} months)`, sev: 5, domain: "finance", detail: "Logged runway below 6 months." });
  } else if (runway !== undefined && runway < 10) {
    findings.push({ id: "R-RUNWAY-W", title: `Runway tightening (${runway.toFixed(1)} months)`, sev: 3, domain: "finance", detail: "Logged runway below 10 months." });
  }

  // R-ATTRITION
  const attrition90 = P.state.events.filter((e) => e.type === "hr.attrition.logged" && within(e.ts, 90)).length;
  if (attrition90 >= 2) {
    findings.push({ id: "R-ATTRITION", title: `Elevated attrition (${attrition90} in 90d)`, sev: attrition90 >= 3 ? 4 : 3, domain: "people", detail: "Multiple hr.attrition.logged events in the last 90 days." });
  }

  // R-INCIDENTS
  const incidents90 = P.state.events.filter((e) => e.type === "ops.incident.logged" && within(e.ts, 90)).length;
  if (incidents90 >= 3) {
    findings.push({ id: "R-INCIDENTS", title: `Operational incident rate elevated (${incidents90} in 90d)`, sev: incidents90 >= 5 ? 4 : 3, domain: "operations", detail: "ops.incident.logged frequency above baseline heuristic (3/90d)." });
  }

  // R-CHURN
  const churnEv = P.state.events.filter((e) => e.type === "cs.churn.logged").sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  if (churnEv && churnEv.data.total) {
    const rate = churnEv.data.churned / churnEv.data.total;
    if (rate > 0.05) {
      findings.push({ id: "R-CHURN", title: `Churn rate ${(rate * 100).toFixed(1)}%`, sev: rate > 0.1 ? 5 : 4, domain: "customer", detail: "Latest cs.churn.logged above 5% heuristic threshold." });
    }
  }

  // R-AT-RISK-ACCOUNTS
  const atRisk = P.state.events.filter((e) => e.type === "cs.health.logged" && e.data.score <= 2 && within(e.ts, 30)).length;
  if (atRisk >= 2) {
    findings.push({ id: "R-ATRISK", title: `${atRisk} accounts at-risk (health ≤2, last 30d)`, sev: atRisk >= 3 ? 4 : 3, domain: "customer", detail: "cs.health.logged score ≤2 within 30 days." });
  }

  // R-WINRATE
  const wins = P.state.events.filter((e) => e.type === "sales.deal.closed" && e.data.result === "won" && within(e.ts, 90)).length;
  const losses = P.state.events.filter((e) => e.type === "sales.deal.closed" && e.data.result === "lost" && within(e.ts, 90)).length;
  if (wins + losses >= 3) {
    const winRate = wins / (wins + losses);
    if (winRate < 0.4) {
      findings.push({ id: "R-WINRATE", title: `Win rate ${(winRate * 100).toFixed(0)}% (last 90d)`, sev: winRate < 0.25 ? 4 : 3, domain: "gtm", detail: "sales.deal.closed win rate below 40% heuristic." });
    }
  }

  // R-TECHDEBT
  const resolvedIds = new Set(P.state.events.filter((e) => e.type === "rd.tech.debt.resolved").map((e) => e.data.debtId));
  const openDebt = P.state.events.filter((e) => e.type === "rd.tech.debt.logged" && !resolvedIds.has(e.id));
  const debtScore = openDebt.reduce((a, e) => a + (e.data.severity || 3) * (e.data.effort || 3), 0);
  if (debtScore >= 20) {
    findings.push({ id: "R-TECHDEBT", title: `Tech debt load score ${debtScore}`, sev: debtScore >= 35 ? 4 : 3, domain: "engineering", detail: "Sum of severity×effort across unresolved rd.tech.debt.logged events." });
  }

  // R-UNANSWERED-COMPETITOR
  const competitorActions = P.state.events.filter((e) => e.type === "competitor.logged");
  const responded = new Set(P.state.events.filter((e) => e.type === "competitor.response").map((e) => e.data.competitorId));
  const unanswered = competitorActions.filter((a) => a.data.response_needed && !responded.has(a.id) && within(a.ts, 45));
  if (unanswered.length >= 2) {
    findings.push({ id: "R-COMPUNANSWERED", title: `${unanswered.length} competitor moves flagged response-needed, unanswered`, sev: unanswered.length >= 4 ? 4 : 3, domain: "competitive", detail: "competitor.logged with response_needed=true and no matching competitor.response within 45 days." });
  }

  // R-STAKEHOLDER-RISK
  const stakeholderRisks = P.state.events.filter((e) => e.type === "stakeholder.risk" && (e.data.severity || 0) >= 4);
  if (stakeholderRisks.length > 0) {
    findings.push({ id: "R-STAKERISK", title: `${stakeholderRisks.length} high-severity stakeholder risk(s) logged`, sev: 4, domain: "stakeholder", detail: "stakeholder.risk events with severity ≥4." });
  }

  // R-MA-DEALBREAKER
  const dealbreakers = P.state.events.filter((e) => e.type === "ma.diligence.item" && e.data.dealBreaker);
  if (dealbreakers.length > 0) {
    findings.push({ id: "R-MADEALBREAKER", title: `${dealbreakers.length} M&A diligence deal-breaker finding(s) open`, sev: 5, domain: "m&a", detail: "ma.diligence.item with dealBreaker=true." });
  }

  // R-PAIN
  const unresolvedPains = P.state.events.filter(
    (e) => e.type === "customer.pain" && !P.state.events.some((r) => r.type === "customer.pain.resolved" && r.data.painId === e.id)
  );
  const hotPain = unresolvedPains.filter((e) => (e.data.severity || 1) >= 4);
  if (hotPain.length > 0) {
    findings.push({ id: "R-PAIN", title: `${hotPain.length} high-severity unresolved customer pain point(s)`, sev: 3, domain: "customer", detail: "customer.pain severity ≥4 without matching customer.pain.resolved." });
  }

  findings.sort((a, b) => b.sev - a.sev);
  return { findings };
}

export const metric = { latestMetricValue };
