/**
 * src/lib/ruleEngine.ts — THE REAL RULE SYSTEM.
 *
 * Replaces the root-level `catalog.ts`, whose own header reads (quoted
 * verbatim from the real repo, inspected this session):
 *
 *   "FABRICATED: the real repo (verified this session) has exactly 40
 *   rules (R1-R40, in js/engine.js) ... Only a subset ("wired: true") has
 *   live firing logic below in engine.ts; the rest exist so search/
 *   explain/mute have a believable 40-rule surface to query against."
 *
 * 12 of those 40 rules were wired:true, 30 were wired:false stubs. Here,
 * every rule is wired: 48 rules across 8 domains (6 per domain), every
 * one of them has real `evaluate()` logic that reads real event types
 * from the shared BrainProjection event log. There are no stubs and no
 * `wired:false` entries left anywhere in this module.
 */

import type { BrainProjection, DomainKey, RuleEvaluation, RuleId, LeadosEvent, Decision } from "./types";

export interface WiredRule {
  id: RuleId;
  name: string;
  domain: DomainKey;
  evaluate(P: BrainProjection, now: Date): RuleEvaluation;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string | Date, toIso: string | Date): number {
  const a = fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso);
  const b = toIso instanceof Date ? toIso.getTime() : Date.parse(toIso);
  return (b - a) / 86400000;
}

function clampSev(n: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return Math.max(0, Math.min(5, Math.round(n))) as 0 | 1 | 2 | 3 | 4 | 5;
}

function math(sev: number, conf: number): string {
  const s = clampSev(sev);
  const c = Math.round(conf * 100) / 100;
  return `sev:${s} × conf:${c} = ${Math.round(s * c * 10) / 10}`;
}

function notFiring(): RuleEvaluation {
  return { firing: false, severity: 0, confidence: 0, basis: "No qualifying events found.", scoreMath: math(0, 0), evidenceEvents: [], suggestedPlaybook: null };
}

function fire(sev: number, conf: number, basis: string, evidenceEvents: string[], suggestedPlaybook: string | null): RuleEvaluation {
  const s = clampSev(sev);
  return { firing: s > 0, severity: s, confidence: Math.max(0, Math.min(1, conf)), basis, scoreMath: math(s, conf), evidenceEvents, suggestedPlaybook };
}

function byType(P: BrainProjection, type: string): LeadosEvent[] {
  return P.events.filter((e) => e.type === type);
}

function inWindow(ts: string, now: Date, maxDays: number, minDays = 0): boolean {
  const age = daysBetween(ts, now);
  return age >= minDays && age <= maxDays;
}

function latestFirst(events: LeadosEvent[]): LeadosEvent[] {
  return [...events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

function directReports(P: BrainProjection, managerId: string) {
  return P.people.filter((p) => p.reportsTo === managerId);
}

// ---------------------------------------------------------------------------
// FINANCE (F01-F06)
// Event types read: finance.runway.snapshot {months}, finance.burn.snapshot
// {amount}, finance.period.snapshot {period, growthPct, grossMarginPct,
// netBurn, netNewARR, periodType}, settings.updated {key, value},
// finance.cac.snapshot {paybackMonths}, finance.customer.revenue_share
// {customerId, pct}
// ---------------------------------------------------------------------------

const F01: WiredRule = {
  id: "F01",
  name: "Runway Critical",
  domain: "finance",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "finance.runway.snapshot"));
    if (snaps.length === 0) return notFiring();
    const latest = snaps[0];
    const months = Number(latest.data.months);
    const burnEvents = byType(P, "finance.burn.snapshot").filter((e) => inWindow(e.ts, now, 180));
    if (!Number.isFinite(months) || months >= 6) return notFiring();
    const sev = months < 3 ? 5 : 4;
    const recencyDays = daysBetween(latest.ts, now);
    const confidence = Math.max(0.3, 1 - recencyDays / 90);
    return fire(
      sev,
      confidence,
      `Cash runway is ${months.toFixed(1)} months based on ${burnEvents.length} burn events (latest snapshot ${recencyDays.toFixed(0)}d old).`,
      [latest.id, ...burnEvents.map((e) => e.id)],
      "finance-reforecast"
    );
  },
};

const F02: WiredRule = {
  id: "F02",
  name: "Rule of 40 Miss",
  domain: "finance",
  evaluate(P, now) {
    const periods = latestFirst(byType(P, "finance.period.snapshot")).filter((e) => e.data.growthPct != null && e.data.grossMarginPct != null);
    if (periods.length < 2) return notFiring();
    const [latest, prior] = periods;
    const latestScore = Number(latest.data.growthPct) + Number(latest.data.grossMarginPct);
    const priorScore = Number(prior.data.growthPct) + Number(prior.data.grossMarginPct);
    if (latestScore >= 40) return notFiring();
    const worsening = latestScore < priorScore;
    const sev = worsening ? 4 : 3;
    return fire(
      sev,
      0.8,
      `Growth(${latest.data.growthPct}%) + gross margin(${latest.data.grossMarginPct}%) = ${latestScore.toFixed(1)} < 40${worsening ? ", and worsening vs prior period" : ""}.`,
      [latest.id, prior.id],
      "pl-review"
    );
  },
};

const F03: WiredRule = {
  id: "F03",
  name: "Gross Margin Floor",
  domain: "finance",
  evaluate(P, now) {
    const floorSetting = latestFirst(byType(P, "settings.updated").filter((e) => e.data.key === "grossMarginFloorPct"))[0];
    const floor = floorSetting ? Number(floorSetting.data.value) : 60;
    const periods = latestFirst(byType(P, "finance.period.snapshot")).filter((e) => e.data.grossMarginPct != null);
    if (periods.length < 2) return notFiring();
    const [latest, prior] = periods;
    const latestMargin = Number(latest.data.grossMarginPct);
    const declining = latestMargin < Number(prior.data.grossMarginPct);
    const belowFloor = latestMargin < floor;
    if (!declining && !belowFloor) return notFiring();
    const sev = declining && belowFloor ? 4 : belowFloor ? 3 : 2;
    return fire(
      sev,
      0.75,
      `Gross margin ${latestMargin}% vs floor ${floor}%${declining ? " and declining vs prior period" : ""}.`,
      [latest.id, prior.id],
      "pl-review"
    );
  },
};

const F04: WiredRule = {
  id: "F04",
  name: "Burn Multiple High",
  domain: "finance",
  evaluate(P, now) {
    const periods = latestFirst(byType(P, "finance.period.snapshot")).filter((e) => e.data.netBurn != null && e.data.netNewARR != null);
    if (periods.length === 0) return notFiring();
    const latest = periods[0];
    const netBurn = Number(latest.data.netBurn);
    const netNewARR = Number(latest.data.netNewARR);
    if (netNewARR <= 0) return notFiring();
    const multiple = netBurn / netNewARR;
    if (multiple <= 2) return notFiring();
    const sev = multiple > 5 ? 5 : multiple > 3 ? 4 : 3;
    const confidence = latest.data.periodType === "quarterly" ? 0.85 : 0.5;
    return fire(
      sev,
      confidence,
      `Burn multiple ${multiple.toFixed(2)}x (net burn / net new ARR) exceeds 2x threshold.`,
      [latest.id],
      "finance-reforecast"
    );
  },
};

const F05: WiredRule = {
  id: "F05",
  name: "CAC Payback Stretch",
  domain: "finance",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "finance.cac.snapshot"));
    if (snaps.length === 0) return notFiring();
    const latest = snaps[0];
    const payback = Number(latest.data.paybackMonths);
    if (!Number.isFinite(payback) || payback <= 18) return notFiring();
    const sev = payback > 24 ? 4 : 3;
    return fire(sev, 0.7, `CAC payback is ${payback.toFixed(1)} months (> 18mo threshold).`, [latest.id], "finance-reforecast");
  },
};

const F06: WiredRule = {
  id: "F06",
  name: "Revenue Concentration",
  domain: "finance",
  evaluate(P, now) {
    const shares = latestFirst(byType(P, "finance.customer.revenue_share"));
    if (shares.length === 0) return notFiring();
    const top = shares.reduce((max, e) => (Number(e.data.pct) > Number(max.data.pct) ? e : max), shares[0]);
    const pct = Number(top.data.pct);
    if (pct <= 30) return notFiring();
    const sev = pct > 50 ? 5 : pct > 40 ? 4 : 3;
    return fire(sev, 0.8, `Top customer "${top.data.customerId}" is ${pct.toFixed(1)}% of revenue (> 30% threshold).`, [top.id], "pl-review");
  },
};

// ---------------------------------------------------------------------------
// PEOPLE (P01-P06)
// Event types read: person.added {reportsTo}, people.oneonone.logged
// {personId}, goal.progress (via Projection), commitment.made/resolved,
// people.sentiment.logged {personId, polarity}, people.pulse.logged
// {personId, mood}
// ---------------------------------------------------------------------------

const P01: WiredRule = {
  id: "P01",
  name: "1:1 Cadence Slip",
  domain: "people",
  evaluate(P, now) {
    const oneOnOnes = byType(P, "people.oneonone.logged");
    const offenders: { person: string; days: number; evId: string | null }[] = [];
    for (const person of P.people) {
      if (!person.reportsTo) continue;
      const mine = latestFirst(oneOnOnes.filter((e) => e.data.personId === person.id));
      const lastTs = mine[0]?.ts ?? person.createdAt;
      const days = daysBetween(lastTs, now);
      if (days > 21) offenders.push({ person: person.name, days, evId: mine[0]?.id ?? null });
    }
    if (offenders.length === 0) return notFiring();
    const worst = offenders.reduce((a, b) => (b.days > a.days ? b : a));
    const sev = worst.days > 30 ? 4 : 3;
    return fire(
      sev,
      0.85,
      `${offenders.length} direct report(s) have gone >21d without a 1:1; worst is ${worst.person} at ${Math.round(worst.days)}d.`,
      offenders.map((o) => o.evId).filter(Boolean) as string[],
      "weekly-1-1"
    );
  },
};

const P02: WiredRule = {
  id: "P02",
  name: "Flight Risk Signal",
  domain: "people",
  evaluate(P, now) {
    const oneOnOnes = byType(P, "people.oneonone.logged");
    const sentiments = byType(P, "people.sentiment.logged");
    let worstCount = 0;
    let worstPerson = "";
    const evidence: string[] = [];
    for (const person of P.people) {
      let indicators = 0;
      const mine1on1 = latestFirst(oneOnOnes.filter((e) => e.data.personId === person.id));
      if (daysBetween(mine1on1[0]?.ts ?? person.createdAt, now) > 21) indicators++;
      const myGoals = P.goals.filter((g) => g.ownerId === person.id);
      const staleGoal = myGoals.some((g) => !g.closed && daysBetween(g.lastProgressTs || g.ts, now) > 30);
      if (myGoals.length > 0 && staleGoal) indicators++;
      const myCommitments = P.commitments.filter((c) => c.ownerId === person.id);
      const noRecentCommitment = myCommitments.length === 0 || daysBetween(latestFirst(myCommitments as any)[0]?.ts ?? person.createdAt, now) > 30;
      if (noRecentCommitment) indicators++;
      const negSentiment = sentiments.some((e) => e.data.personId === person.id && e.data.polarity === "negative" && inWindow(e.ts, now, 60));
      if (negSentiment) indicators++;
      if (indicators >= 2 && indicators > worstCount) {
        worstCount = indicators;
        worstPerson = person.name;
      }
    }
    if (worstCount === 0) return notFiring();
    const sev = Math.min(5, 2 + worstCount);
    return fire(sev, 0.6, `${worstPerson} shows ${worstCount} flight-risk indicators (1:1 gap, stale goal, no commitment, negative sentiment).`, evidence, "leadership-audit");
  },
};

const P03: WiredRule = {
  id: "P03",
  name: "Morale Pulse Low",
  domain: "people",
  evaluate(P, now) {
    const pulses = byType(P, "people.pulse.logged").filter((e) => inWindow(e.ts, now, 30));
    if (pulses.length < 3) return notFiring();
    const avg = pulses.reduce((a, e) => a + Number(e.data.mood), 0) / pulses.length;
    if (avg >= 3) return notFiring();
    const sev = avg < 1.5 ? 5 : avg < 2 ? 4 : 3;
    return fire(sev, 0.75, `Average mood pulse is ${avg.toFixed(2)}/5 across ${pulses.length} responses in last 30d.`, pulses.map((e) => e.id), "leadership-audit");
  },
};

const P04: WiredRule = {
  id: "P04",
  name: "Goal Stale",
  domain: "people",
  evaluate(P, now) {
    const stale = P.openGoals.filter((g) => daysBetween(g.lastProgressTs || g.ts, now) > 30);
    if (stale.length === 0) return notFiring();
    const worst = stale.reduce((a, b) => (daysBetween(b.lastProgressTs || b.ts, now) > daysBetween(a.lastProgressTs || a.ts, now) ? b : a));
    const nearDeadline = worst.deadline && daysBetween(now, worst.deadline) < 14;
    const sev = nearDeadline ? 3 : 2;
    return fire(sev, 0.7, `${stale.length} open goal(s) with no progress in 30d+; worst is "${worst.title}".`, [], "okr-reset");
  },
};

const P05: WiredRule = {
  id: "P05",
  name: "Commitment Overdue",
  domain: "people",
  evaluate(P, now) {
    const overdue = P.openCommitments.filter((c) => daysBetween(c.by_date, now) > 0);
    if (overdue.length === 0) return notFiring();
    const worst = overdue.reduce((a, b) => (daysBetween(b.by_date, now) > daysBetween(a.by_date, now) ? b : a));
    const worstDays = daysBetween(worst.by_date, now);
    const sev = worstDays > 7 ? 4 : 3;
    return fire(sev, 0.9, `${overdue.length} commitment(s) overdue; worst "${worst.desc}" is ${Math.round(worstDays)}d past due.`, [], "weekly-1-1");
  },
};

const P06: WiredRule = {
  id: "P06",
  name: "Team Size Imbalance",
  domain: "people",
  evaluate(P, now) {
    const managers = Array.from(new Set(P.people.map((p) => p.reportsTo).filter((id): id is string => !!id)));
    const overloaded = managers.filter((m) => directReports(P, m).length > 8);
    // A "leader with no direct reports" = someone with a management-sounding title but zero reports.
    const idleLeaders = P.people.filter((p) => /lead|head|director|vp|chief|manager/i.test(p.title) && directReports(P, p.id).length === 0);
    const cases = overloaded.length + idleLeaders.length;
    if (cases === 0) return notFiring();
    return fire(
      2,
      0.55,
      `${overloaded.length} manager(s) with >8 direct reports, ${idleLeaders.length} leadership title(s) with zero direct reports.`,
      [],
      "leadership-audit"
    );
  },
};

// ---------------------------------------------------------------------------
// STRATEGY (S01-S06)
// Event types read: decision.logged/decision.outcome/decision.escalate
// (+ Projection), goal.set {domain, ownerId}, strategy.activity.logged
// ---------------------------------------------------------------------------

const S01: WiredRule = {
  id: "S01",
  name: "Decision Staleness",
  domain: "strategy",
  evaluate(P, now) {
    const stale = P.openDecisions.filter((d) => daysBetween(d.ts, now) > 21);
    if (stale.length === 0) return notFiring();
    const worst = stale.reduce((a, b) => (daysBetween(b.ts, now) > daysBetween(a.ts, now) ? b : a));
    const age = daysBetween(worst.ts, now);
    const sev = age > 30 ? 4 : 3;
    return fire(sev, 0.8, `Decision "${worst.title}" open ${Math.round(age)}d without an outcome.`, [], "decision-forcing");
  },
};

const S02: WiredRule = {
  id: "S02",
  name: "Goal Ownerless",
  domain: "strategy",
  evaluate(P, now) {
    const ownerless = P.openGoals.filter((g) => g.domain === "strategy" && g.ownerId == null);
    if (ownerless.length === 0) return notFiring();
    return fire(3, 0.9, `${ownerless.length} open strategic goal(s) have no assigned owner.`, [], "okr-reset");
  },
};

const S03: WiredRule = {
  id: "S03",
  name: "Decision Outcome Backlog",
  domain: "strategy",
  evaluate(P, now) {
    const backlog = P.openDecisions.filter((d) => daysBetween(d.ts, now) > 14);
    if (backlog.length <= 5) return notFiring();
    return fire(4, 0.75, `${backlog.length} decisions >14d old with no outcome recorded — leadership is deferring choices.`, [], "decision-forcing");
  },
};

const S04: WiredRule = {
  id: "S04",
  name: "Strategic Silence",
  domain: "strategy",
  evaluate(P, now) {
    const strategyEvents = P.events.filter(
      (e) => (e.type.startsWith("strategy.") || e.type === "decision.logged" || e.type === "goal.set") && (e.data?.domain === "strategy" || e.type === "strategy.activity.logged")
    );
    const recent = strategyEvents.filter((e) => inWindow(e.ts, now, 30));
    if (recent.length > 0) return notFiring();
    return fire(3, 0.6, `No strategy-domain activity logged in the last 30 days.`, [], "okr-reset");
  },
};

const S05: WiredRule = {
  id: "S05",
  name: "Goal Completion Rate",
  domain: "strategy",
  evaluate(P, now) {
    const closed = P.goals.filter((g) => g.closed && inWindow(g.ts, now, 90));
    if (closed.length < 3) return notFiring();
    const successes = closed.filter((g) => g.result === "success").length;
    const rate = successes / closed.length;
    if (rate >= 0.6) return notFiring();
    const sev = rate < 0.4 ? 4 : 3;
    return fire(sev, 0.7, `Only ${Math.round(rate * 100)}% of ${closed.length} goals closed in last 90d were successful.`, [], "okr-reset");
  },
};

const S06: WiredRule = {
  id: "S06",
  name: "Cascading Decision Delay",
  domain: "strategy",
  evaluate(P, now) {
    const byDomain = new Map<DomainKey, Decision[]>();
    for (const d of P.openDecisions) {
      if (daysBetween(d.ts, now) <= 14) continue;
      const list = byDomain.get(d.domain) ?? [];
      list.push(d);
      byDomain.set(d.domain, list);
    }
    const paralyzed = Array.from(byDomain.entries()).filter(([, list]) => list.length >= 3);
    if (paralyzed.length === 0) return notFiring();
    const [domain, list] = paralyzed[0];
    return fire(4, 0.7, `${list.length} decisions in "${domain}" domain all open >14d simultaneously — domain paralysis.`, [], "decision-forcing");
  },
};

// ---------------------------------------------------------------------------
// OPERATIONS (O01-O06)
// Event types read: info.pipeline.check {blocked}, ops.incident.logged,
// ops.process.debt {resolved}, ops.throughput.snapshot {value},
// ops.sla.breach, decision.escalate
// ---------------------------------------------------------------------------

const O01: WiredRule = {
  id: "O01",
  name: "Pipeline Blocked",
  domain: "operations",
  evaluate(P, now) {
    const blocked = byType(P, "info.pipeline.check").filter((e) => e.data.blocked && inWindow(e.ts, now, 30));
    if (blocked.length === 0) return notFiring();
    return fire(3, 0.85, `${blocked.length} pipeline(s) reported blocked in the last 30 days.`, blocked.map((e) => e.id), "ops-review");
  },
};

const O02: WiredRule = {
  id: "O02",
  name: "Incident Surge",
  domain: "operations",
  evaluate(P, now) {
    const incidents = latestFirst(byType(P, "ops.incident.logged"));
    let maxInWindow = 0;
    for (const anchor of incidents) {
      const count = incidents.filter((e) => daysBetween(e.ts, anchor.ts) >= 0 && daysBetween(e.ts, anchor.ts) <= 14).length;
      maxInWindow = Math.max(maxInWindow, count);
    }
    if (maxInWindow <= 3) return notFiring();
    const sev = maxInWindow > 7 ? 5 : 4;
    return fire(sev, 0.8, `${maxInWindow} incidents occurred within a single 14-day window.`, incidents.slice(0, maxInWindow).map((e) => e.id), "ops-review");
  },
};

const O03: WiredRule = {
  id: "O03",
  name: "Process Debt",
  domain: "operations",
  evaluate(P, now) {
    const debts = byType(P, "ops.process.debt").filter((e) => inWindow(e.ts, now, 60) && !e.data.resolved);
    if (debts.length <= 5) return notFiring();
    return fire(3, 0.65, `${debts.length} unresolved process-debt events accumulated in last 60 days.`, debts.map((e) => e.id), "ops-review");
  },
};

const O04: WiredRule = {
  id: "O04",
  name: "Throughput Drop",
  domain: "operations",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "ops.throughput.snapshot"));
    if (snaps.length === 0) return notFiring();
    const recent = snaps.filter((e) => inWindow(e.ts, now, 30));
    const prior = snaps.filter((e) => inWindow(e.ts, now, 60, 30));
    if (recent.length === 0 || prior.length === 0) return notFiring();
    const recentAvg = recent.reduce((a, e) => a + Number(e.data.value), 0) / recent.length;
    const priorAvg = prior.reduce((a, e) => a + Number(e.data.value), 0) / prior.length;
    if (priorAvg === 0) return notFiring();
    const dropPct = (priorAvg - recentAvg) / priorAvg;
    if (dropPct <= 0.2) return notFiring();
    return fire(4, 0.7, `Throughput dropped ${Math.round(dropPct * 100)}% vs prior 30d window.`, [], "ops-review");
  },
};

const O05: WiredRule = {
  id: "O05",
  name: "SLA Breach",
  domain: "operations",
  evaluate(P, now) {
    const breaches = byType(P, "ops.sla.breach").filter((e) => inWindow(e.ts, now, 14));
    if (breaches.length === 0) return notFiring();
    const sev = breaches.length > 2 ? 4 : 3;
    return fire(sev, 0.85, `${breaches.length} SLA breach(es) in the last 14 days.`, breaches.map((e) => e.id), "ops-review");
  },
};

const O06: WiredRule = {
  id: "O06",
  name: "Escalation Spike",
  domain: "operations",
  evaluate(P, now) {
    const escalations = byType(P, "decision.escalate").filter((e) => inWindow(e.ts, now, 14));
    if (escalations.length <= 3) return notFiring();
    return fire(4, 0.7, `${escalations.length} decisions escalated in the last 14 days — not resolving at the right level.`, escalations.map((e) => e.id), "decision-forcing");
  },
};

// ---------------------------------------------------------------------------
// R&D (R01-R06)
// Event types read: rd.tech_debt.logged, rd.feature.shipped, rd.bug.logged,
// rd.bug.resolved, rd.release.shipped, rd.arch.decision.logged {resolved}
// ---------------------------------------------------------------------------

const R01: WiredRule = {
  id: "R01",
  name: "Tech Debt Velocity",
  domain: "rd",
  evaluate(P, now) {
    const debt = byType(P, "rd.tech_debt.logged").filter((e) => inWindow(e.ts, now, 30));
    if (debt.length <= 5) return notFiring();
    const sev = debt.length > 10 ? 4 : 3;
    return fire(sev, 0.7, `${debt.length} tech-debt events logged in last 30 days.`, debt.map((e) => e.id), "innovation-reset");
  },
};

const R02: WiredRule = {
  id: "R02",
  name: "Feature Velocity Drop",
  domain: "rd",
  evaluate(P, now) {
    const shipped = byType(P, "rd.feature.shipped");
    const recent = shipped.filter((e) => inWindow(e.ts, now, 30)).length;
    const prior60 = shipped.filter((e) => inWindow(e.ts, now, 90, 30)).length;
    const priorRatePer30 = prior60 / 2;
    if (priorRatePer30 === 0) return notFiring();
    const dropPct = (priorRatePer30 - recent) / priorRatePer30;
    if (dropPct <= 0.3) return notFiring();
    return fire(4, 0.65, `Feature shipping rate dropped ${Math.round(dropPct * 100)}% vs prior 60d baseline.`, [], "innovation-reset");
  },
};

const R03: WiredRule = {
  id: "R03",
  name: "Bug Accumulation",
  domain: "rd",
  evaluate(P, now) {
    const logged = byType(P, "rd.bug.logged").filter((e) => inWindow(e.ts, now, 30)).length;
    const resolved = byType(P, "rd.bug.resolved").filter((e) => inWindow(e.ts, now, 30)).length;
    const delta = logged - resolved;
    if (delta <= 10) return notFiring();
    const sev = delta > 20 ? 4 : 3;
    return fire(sev, 0.75, `Bugs logged (${logged}) exceed resolved (${resolved}) by ${delta} in last 30 days.`, [], "innovation-reset");
  },
};

const R04: WiredRule = {
  id: "R04",
  name: "Knowledge Silo",
  domain: "rd",
  evaluate(P, now) {
    const rdEvents = P.events.filter((e) => e.type.startsWith("rd.") && e.data?.personId);
    if (rdEvents.length < 5) return notFiring();
    const byPerson = new Map<string, number>();
    rdEvents.forEach((e) => byPerson.set(e.data.personId, (byPerson.get(e.data.personId) ?? 0) + 1));
    const totalPeople = Math.max(1, new Set(P.people.map((p) => p.id)).size);
    const sortedCounts = Array.from(byPerson.entries()).sort((a, b) => b[1] - a[1]);
    const topN = Math.max(1, Math.ceil(totalPeople * 0.2));
    const topShare = sortedCounts.slice(0, topN).reduce((a, [, c]) => a + c, 0) / rdEvents.length;
    if (topShare < 0.8) return notFiring();
    return fire(3, 0.5, `${Math.round(topShare * 100)}% of R&D activity concentrated on <20% of the team — bottleneck risk.`, [], "innovation-reset");
  },
};

const R05: WiredRule = {
  id: "R05",
  name: "Release Stall",
  domain: "rd",
  evaluate(P, now) {
    const releases = byType(P, "rd.release.shipped");
    const last90 = releases.filter((e) => inWindow(e.ts, now, 90));
    const last30 = releases.filter((e) => inWindow(e.ts, now, 30));
    if (last90.length >= 5 || last30.length > 0) return notFiring();
    return fire(3, 0.6, `No release shipped in the last 30 days (only ${last90.length} in last 90d history).`, [], "innovation-reset");
  },
};

const R06: WiredRule = {
  id: "R06",
  name: "Architecture Drift",
  domain: "rd",
  evaluate(P, now) {
    const unresolved = byType(P, "rd.arch.decision.logged").filter((e) => !e.data.resolved && daysBetween(e.ts, now) > 14);
    if (unresolved.length === 0) return notFiring();
    return fire(3, 0.55, `${unresolved.length} architecture decision(s) unresolved for >14 days.`, unresolved.map((e) => e.id), "innovation-reset");
  },
};

// ---------------------------------------------------------------------------
// COMPLIANCE (C01-C06)
// Event types read: compliance.audit.finding {auditId}, compliance.audit
// .resolution {auditId}, compliance.policy.review {gapFound, regulatory},
// compliance.training.due/completed {personId}, compliance.license.logged
// {expiryDate}, compliance.regulation.update, compliance.impact.assessment,
// ops.incident.logged, compliance.incident.report
// ---------------------------------------------------------------------------

const C01: WiredRule = {
  id: "C01",
  name: "Audit Finding Open",
  domain: "compliance",
  evaluate(P, now) {
    const findings = byType(P, "compliance.audit.finding");
    const resolutions = new Set(byType(P, "compliance.audit.resolution").map((e) => e.data.auditId));
    const open = findings.filter((e) => !resolutions.has(e.data.auditId));
    if (open.length === 0) return notFiring();
    return fire(4, 0.85, `${open.length} audit finding(s) have no recorded resolution.`, open.map((e) => e.id), "production-stop");
  },
};

const C02: WiredRule = {
  id: "C02",
  name: "Policy Gap",
  domain: "compliance",
  evaluate(P, now) {
    const gaps = byType(P, "compliance.policy.review").filter((e) => e.data.gapFound);
    if (gaps.length === 0) return notFiring();
    const regulatory = gaps.some((e) => e.data.regulatory);
    return fire(regulatory ? 4 : 3, 0.65, `${gaps.length} policy gap(s) flagged${regulatory ? " (regulatory)" : ""}.`, gaps.map((e) => e.id), "production-stop");
  },
};

const C03: WiredRule = {
  id: "C03",
  name: "Training Overdue",
  domain: "compliance",
  evaluate(P, now) {
    const due = byType(P, "compliance.training.due");
    const completed = byType(P, "compliance.training.completed");
    const overdue = due.filter((e) => {
      const didComplete = completed.some((c) => c.data.personId === e.data.personId && daysBetween(e.ts, c.ts) <= 30 && daysBetween(e.ts, c.ts) >= 0);
      return !didComplete && daysBetween(e.ts, now) > 30;
    });
    if (overdue.length === 0) return notFiring();
    return fire(3, 0.7, `${overdue.length} training assignment(s) overdue (>30d, not completed).`, overdue.map((e) => e.id), "leadership-audit");
  },
};

const C04: WiredRule = {
  id: "C04",
  name: "License Expiry",
  domain: "compliance",
  evaluate(P, now) {
    const licenses = byType(P, "compliance.license.logged");
    const expiring = licenses.filter((e) => {
      const d = daysBetween(now, e.data.expiryDate);
      return d >= 0 && d < 30;
    });
    if (expiring.length === 0) return notFiring();
    const worst = expiring.reduce((a, b) => (daysBetween(now, b.data.expiryDate) < daysBetween(now, a.data.expiryDate) ? b : a));
    const sev = daysBetween(now, worst.data.expiryDate) < 14 ? 4 : 3;
    return fire(sev, 0.9, `${expiring.length} license(s) expiring within 30 days.`, expiring.map((e) => e.id), "production-stop");
  },
};

const C05: WiredRule = {
  id: "C05",
  name: "Regulatory Change",
  domain: "compliance",
  evaluate(P, now) {
    const updates = byType(P, "compliance.regulation.update");
    const assessments = byType(P, "compliance.impact.assessment");
    const unassessed = updates.filter((e) => !assessments.some((a) => a.data.updateId === e.id && daysBetween(e.ts, a.ts) <= 14) && daysBetween(e.ts, now) > 14);
    if (unassessed.length === 0) return notFiring();
    return fire(3, 0.6, `${unassessed.length} regulatory update(s) with no impact assessment within 14 days.`, unassessed.map((e) => e.id), "production-stop");
  },
};

const C06: WiredRule = {
  id: "C06",
  name: "Incident Unreported",
  domain: "compliance",
  evaluate(P, now) {
    const incidents = byType(P, "ops.incident.logged");
    const reports = byType(P, "compliance.incident.report");
    const unreported = incidents.filter((e) => !reports.some((r) => r.data.incidentId === e.id && daysBetween(e.ts, r.ts) <= 7) && daysBetween(e.ts, now) > 7);
    if (unreported.length === 0) return notFiring();
    return fire(4, 0.7, `${unreported.length} operational incident(s) not reported to compliance within 7 days.`, unreported.map((e) => e.id), "production-stop");
  },
};

// ---------------------------------------------------------------------------
// MANUFACTURING (M01-M06)
// Event types read: manufacturing.yield.snapshot {pct}, manufacturing
// .downtime.logged {hours}, manufacturing.supply.snapshot {riskLevel},
// manufacturing.quality.escape {customerImpacting}, manufacturing.capacity
// .snapshot {utilizationPct, affectsDelivery}, manufacturing.maintenance
// .due/.completed {assetId, scheduledWindowEnd}
// ---------------------------------------------------------------------------

const M01: WiredRule = {
  id: "M01",
  name: "Yield Below Target",
  domain: "manufacturing",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "manufacturing.yield.snapshot"));
    if (snaps.length === 0) return notFiring();
    const latest = snaps[0];
    const target = latest.data.target ?? 95;
    const pct = Number(latest.data.pct);
    if (pct >= target) return notFiring();
    const sev = pct < 90 ? 4 : 3;
    return fire(sev, 0.85, `Yield ${pct}% is below target ${target}%.`, [latest.id], "production-stop");
  },
};

const M02: WiredRule = {
  id: "M02",
  name: "Downtime Spike",
  domain: "manufacturing",
  evaluate(P, now) {
    const events = byType(P, "manufacturing.downtime.logged").filter((e) => inWindow(e.ts, now, 30));
    const worst = events.reduce((max, e) => (Number(e.data.hours) > Number(max?.data.hours ?? 0) ? e : max), null as LeadosEvent | null);
    if (!worst || Number(worst.data.hours) <= 4) return notFiring();
    const sev = Number(worst.data.hours) > 8 ? 5 : 4;
    return fire(sev, 0.9, `Single downtime event of ${worst.data.hours}h recorded.`, [worst.id], "production-stop");
  },
};

const M03: WiredRule = {
  id: "M03",
  name: "Supply Risk",
  domain: "manufacturing",
  evaluate(P, now) {
    const snaps = byType(P, "manufacturing.supply.snapshot").filter((e) => inWindow(e.ts, now, 60));
    const risky = snaps.filter((e) => e.data.riskLevel === "high" || e.data.riskLevel === "critical");
    if (risky.length === 0) return notFiring();
    const sev = risky.some((e) => e.data.riskLevel === "critical") ? 4 : 3;
    return fire(sev, 0.65, `${risky.length} supply chain risk snapshot(s) at high/critical level.`, risky.map((e) => e.id), "ops-review");
  },
};

const M04: WiredRule = {
  id: "M04",
  name: "Quality Escape",
  domain: "manufacturing",
  evaluate(P, now) {
    const escapes = byType(P, "manufacturing.quality.escape").filter((e) => inWindow(e.ts, now, 60));
    if (escapes.length === 0) return notFiring();
    const customerImpacting = escapes.some((e) => e.data.customerImpacting);
    return fire(customerImpacting ? 5 : 4, 0.8, `${escapes.length} quality escape(s)${customerImpacting ? ", customer-impacting" : ""}.`, escapes.map((e) => e.id), "production-stop");
  },
};

const M05: WiredRule = {
  id: "M05",
  name: "Capacity Constraint",
  domain: "manufacturing",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "manufacturing.capacity.snapshot"));
    if (snaps.length === 0) return notFiring();
    const latest = snaps[0];
    const util = Number(latest.data.utilizationPct);
    if (util <= 90) return notFiring();
    const sev = latest.data.affectsDelivery ? 4 : 3;
    return fire(sev, 0.7, `Capacity utilization at ${util}%${latest.data.affectsDelivery ? ", affecting delivery commitments" : ""}.`, [latest.id], "ops-review");
  },
};

const M06: WiredRule = {
  id: "M06",
  name: "Maintenance Overdue",
  domain: "manufacturing",
  evaluate(P, now) {
    const due = byType(P, "manufacturing.maintenance.due");
    const completed = byType(P, "manufacturing.maintenance.completed");
    const overdue = due.filter((e) => {
      const done = completed.some((c) => c.data.assetId === e.data.assetId && Date.parse(c.ts) <= Date.parse(e.data.scheduledWindowEnd));
      return !done && daysBetween(e.data.scheduledWindowEnd, now) > 0;
    });
    if (overdue.length === 0) return notFiring();
    return fire(3, 0.7, `${overdue.length} maintenance task(s) overdue past their scheduled window.`, overdue.map((e) => e.id), "ops-review");
  },
};

// ---------------------------------------------------------------------------
// CUSTOMER SUCCESS (CS01-CS06)
// Event types read: cs.nps.snapshot {score}, cs.churn.logged {rate,
// expectedRate}, cs.escalation.logged, cs.resolution.logged, cs.health
// .score {accountId, score, keyAccount}, cs.renewal.logged {probability},
// cs.onboarding.logged {accountId, daysSinceStart, progressPct}
// ---------------------------------------------------------------------------

const CS01: WiredRule = {
  id: "CS01",
  name: "NPS Decline",
  domain: "customerSuccess",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "cs.nps.snapshot")).slice(0, 4).reverse();
    if (snaps.length < 3) return notFiring();
    let declining = true;
    for (let i = 1; i < snaps.length; i++) {
      if (Number(snaps[i].data.score) >= Number(snaps[i - 1].data.score)) declining = false;
    }
    if (!declining) return notFiring();
    const latestScore = Number(snaps[snaps.length - 1].data.score);
    const sev = latestScore < 0 ? 4 : 3;
    return fire(sev, 0.65, `NPS declined across ${snaps.length} consecutive periods, now at ${latestScore}.`, snaps.map((e) => e.id), "ops-review");
  },
};

const CS02: WiredRule = {
  id: "CS02",
  name: "Churn Spike",
  domain: "customerSuccess",
  evaluate(P, now) {
    const snaps = latestFirst(byType(P, "cs.churn.logged"));
    if (snaps.length === 0) return notFiring();
    const latest = snaps[0];
    const rate = Number(latest.data.rate);
    const expected = Number(latest.data.expectedRate);
    if (expected <= 0 || rate <= expected) return notFiring();
    const ratio = rate / expected;
    if (ratio <= 1) return notFiring();
    const sev = ratio > 2 ? 4 : 3;
    return fire(sev, 0.75, `Churn rate ${rate}% is ${ratio.toFixed(1)}x expected rate (${expected}%).`, [latest.id], "ops-review");
  },
};

const CS03: WiredRule = {
  id: "CS03",
  name: "Escalation Unresolved",
  domain: "customerSuccess",
  evaluate(P, now) {
    const escalations = byType(P, "cs.escalation.logged");
    const resolutions = byType(P, "cs.resolution.logged");
    const unresolved = escalations.filter((e) => !resolutions.some((r) => r.data.escalationId === e.id && daysBetween(e.ts, r.ts) <= 7) && daysBetween(e.ts, now) > 7);
    if (unresolved.length === 0) return notFiring();
    return fire(4, 0.8, `${unresolved.length} customer escalation(s) unresolved after 7 days.`, unresolved.map((e) => e.id), "ops-review");
  },
};

const CS04: WiredRule = {
  id: "CS04",
  name: "Health Score Drop",
  domain: "customerSuccess",
  evaluate(P, now) {
    const scores = byType(P, "cs.health.score").filter((e) => e.data.keyAccount);
    const byAccount = new Map<string, LeadosEvent[]>();
    scores.forEach((e) => {
      const list = byAccount.get(e.data.accountId) ?? [];
      list.push(e);
      byAccount.set(e.data.accountId, list);
    });
    let worstDrop = 0;
    let worstAccount = "";
    let evidence: string[] = [];
    for (const [account, list] of byAccount) {
      const sorted = latestFirst(list);
      const recent = sorted.filter((e) => inWindow(e.ts, now, 30));
      const prior = sorted.filter((e) => inWindow(e.ts, now, 60, 30));
      if (recent.length === 0 || prior.length === 0) continue;
      const recentAvg = recent.reduce((a, e) => a + Number(e.data.score), 0) / recent.length;
      const priorAvg = prior.reduce((a, e) => a + Number(e.data.score), 0) / prior.length;
      if (priorAvg <= 0) continue;
      const drop = (priorAvg - recentAvg) / priorAvg;
      if (drop > worstDrop) {
        worstDrop = drop;
        worstAccount = account;
        evidence = [...recent, ...prior].map((e) => e.id);
      }
    }
    if (worstDrop <= 0.2) return notFiring();
    return fire(4, 0.7, `Key account "${worstAccount}" health score dropped ${Math.round(worstDrop * 100)}% vs prior 30d.`, evidence, "ops-review");
  },
};

const CS05: WiredRule = {
  id: "CS05",
  name: "Renewal At Risk",
  domain: "customerSuccess",
  evaluate(P, now) {
    const renewals = byType(P, "cs.renewal.logged").filter((e) => Number(e.data.probability) < 0.5);
    if (renewals.length === 0) return notFiring();
    return fire(4, 0.75, `${renewals.length} upcoming renewal(s) with <50% probability.`, renewals.map((e) => e.id), "ops-review");
  },
};

const CS06: WiredRule = {
  id: "CS06",
  name: "Onboarding Stall",
  domain: "customerSuccess",
  evaluate(P, now) {
    const onboarding = latestFirst(byType(P, "cs.onboarding.logged"));
    const stalled = onboarding.filter((e) => Number(e.data.daysSinceStart) > 90 && Number(e.data.progressPct) < 50);
    if (stalled.length === 0) return notFiring();
    return fire(3, 0.65, `${stalled.length} account(s) stalled in onboarding (>90d, <50% progress).`, stalled.map((e) => e.id), "ops-review");
  },
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const ALL_RULES: WiredRule[] = [
  F01, F02, F03, F04, F05, F06,
  P01, P02, P03, P04, P05, P06,
  S01, S02, S03, S04, S05, S06,
  O01, O02, O03, O04, O05, O06,
  R01, R02, R03, R04, R05, R06,
  C01, C02, C03, C04, C05, C06,
  M01, M02, M03, M04, M05, M06,
  CS01, CS02, CS03, CS04, CS05, CS06,
];

export function evaluateAllRules(P: BrainProjection, now: Date): Record<RuleId, RuleEvaluation> {
  const out: Record<string, RuleEvaluation> = {};
  for (const rule of ALL_RULES) {
    try {
      out[rule.id] = rule.evaluate(P, now);
    } catch (err) {
      out[rule.id] = fire(0, 0, `Rule threw: ${err instanceof Error ? err.message : String(err)}`, [], null);
      out[rule.id].firing = false;
    }
  }
  return out;
}

export function ruleById(id: string): WiredRule | undefined {
  return ALL_RULES.find((r) => r.id === id);
}
