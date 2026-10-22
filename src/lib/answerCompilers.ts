// =============================================================================
// Part 32 — answer compilers (Phase 1 / Phase 3a).
// =============================================================================
// One function per ontology question. Each is deterministic: given an
// OrgDataset and a shared FactLedger, it either returns a fully-cited
// QuestionAnswer or an honest NotAnswerableYet. No LLM runs here — this is
// the same "deterministic core, prose is a polish layer on top" discipline
// as the real `src/lib/briefing.ts`. The "ask the product anything" seam
// (CommandPalette-style free text) decomposes to one of these 20 ids; there
// is no 21st path that invents a number.
import type { OrgDataset, RiskItem } from "./domainData";
import type { AnswerResult, Driver, EvidenceRef, QuestionAnswer, RecommendedAction, Trend } from "./types";
import { FactLedger } from "./citations";
import { formatCurrency } from "./format";

function trendFrom(deltaPct: number | null, sinceLabel = "vs last cycle"): Trend | null {
  if (deltaPct === null) return null;
  return { direction: deltaPct > 0.05 ? "up" : deltaPct < -0.05 ? "down" : "flat", deltaPct, sinceLabel };
}

function notAnswerable(questionId: string, domain: QuestionAnswer["domain"], reason: string, whatWouldUnlockIt: string): AnswerResult {
  return { questionId, notAnswerable: true, reason, whatWouldUnlockIt, domain };
}

type Compiler = (ds: OrgDataset, ledger: FactLedger) => AnswerResult;

const COMPILERS: Record<string, Compiler> = {
  // ---- Top 5 --------------------------------------------------------------
  "ops.needsMeToday": (ds, ledger) => {
    if (ds.approvalsInbox.length === 0) {
      return notAnswerable("ops.needsMeToday", "operations", "No pending approvals or decisions are queued right now.", "This becomes meaningful the moment an approval is requested — nothing to unlock, this is a true zero.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = ds.approvalsInbox.map((a) => {
      const factId = ledger.cite(`${a.title} — risk class`, a.riskClass === "high" ? 3 : a.riskClass === "medium" ? 2 : 1, { unit: "score", domain: a.domain, sourceView: "inbox", confidence: "actual" });
      refs.push({ factId, label: a.title, domain: a.domain, sourceView: "inbox" });
      return { label: `${a.title} (${a.riskClass} risk, due ${a.dueDate})`, refs: [factId], contributionPct: null };
    });
    const actions: RecommendedAction[] = ds.approvalsInbox.map((a) => ({ label: `Review: ${a.title}`, kind: "approval", refId: a.id }));
    return {
      questionId: "ops.needsMeToday", notAnswerable: false, domain: "operations",
      headline: `${ds.approvalsInbox.length} item${ds.approvalsInbox.length === 1 ? "" : "s"} in your approval queue today.`,
      trend: null, confidenceClass: "actual", drivers, actions, evidenceRefs: refs,
    };
  },

  "ops.whatChanged": (ds, ledger) => {
    if (ds.auditLog.length === 0) {
      return notAnswerable("ops.whatChanged", "operations", "No audit events are recorded yet for this workspace.", "Becomes answerable once any metric, decision, or event is logged.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = ds.auditLog.slice(0, 5).map((e) => {
      const factId = ledger.cite(`Audit event: ${e.summary.slice(0, 40)}`, 1, { unit: "count", domain: e.domain, sourceView: "audit", confidence: "actual" });
      refs.push({ factId, label: e.summary, domain: e.domain, sourceView: "audit" });
      return { label: e.summary, refs: [factId], contributionPct: null };
    });
    return {
      questionId: "ops.whatChanged", notAnswerable: false, domain: "operations",
      headline: `${ds.auditLog.length} change${ds.auditLog.length === 1 ? "" : "s"} logged since the system's last snapshot.`,
      trend: null, confidenceClass: "actual", drivers, actions: [], evidenceRefs: refs,
    };
  },

  "finance.onPlan": (ds, ledger) => {
    const { revenueActual, revenuePlan, revenueConfidence, month } = ds.finance;
    const deltaPct = revenuePlan === 0 ? 0 : ((revenueActual - revenuePlan) / revenuePlan) * 100;
    const actualRef = ledger.cite(`${month} revenue (actual)`, revenueActual, { unit: "usd", domain: "finance", sourceView: "finance", confidence: revenueConfidence });
    const planRef = ledger.cite(`${month} revenue (plan)`, revenuePlan, { unit: "usd", domain: "finance", sourceView: "finance", confidence: "evidence" });
    const onPlan = Math.abs(deltaPct) < 2;
    return {
      questionId: "finance.onPlan", notAnswerable: false, domain: "finance",
      headline: onPlan
        ? `On plan: ${month} revenue closed at ${formatCurrency(revenueActual)}, within 2% of the ${formatCurrency(revenuePlan)} plan.`
        : `Off plan: ${month} revenue closed at ${formatCurrency(revenueActual)} vs a ${formatCurrency(revenuePlan)} plan (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%).`,
      trend: trendFrom(deltaPct, "vs plan"), confidenceClass: revenueConfidence,
      drivers: [{ label: "Plan gap", refs: [actualRef, planRef], contributionPct: deltaPct }],
      actions: onPlan ? [] : [{ label: "Open finance variance drill-down", kind: "note" }],
      evidenceRefs: [
        { factId: actualRef, label: "Revenue actual", domain: "finance", sourceView: "finance" },
        { factId: planRef, label: "Revenue plan", domain: "finance", sourceView: "finance" },
      ],
    };
  },

  "risk.topRisk": (ds, ledger) => {
    if (ds.risk.items.length === 0) {
      return notAnswerable("risk.topRisk", "risk", "No risk indicators are being tracked for this workspace yet.", "Add at least one risk indicator with a threshold to light this up.");
    }
    const top = [...ds.risk.items].sort((a, b) => b.proximityPct - a.proximityPct)[0] as RiskItem;
    const valRef = ledger.cite(`${top.title} — current indicator`, top.indicatorValue, { unit: top.title.toLowerCase().includes("latency") ? "count" : "count", domain: top.domain, sourceView: "risk", confidence: "actual" });
    const thrRef = ledger.cite(`${top.title} — threshold`, top.thresholdValue, { unit: "count", domain: top.domain, sourceView: "risk", confidence: "evidence" });
    const proxRef = ledger.cite(`${top.title} — proximity`, top.proximityPct, { unit: "pct", domain: top.domain, sourceView: "risk", confidence: "actual" });
    return {
      questionId: "risk.topRisk", notAnswerable: false, domain: "risk",
      headline: `${top.title} is the top risk — ${top.proximityPct.toFixed(0)}% of the way to its threshold (${top.severity} severity).`,
      trend: null, confidenceClass: "actual",
      drivers: [{ label: top.title, refs: [valRef, thrRef, proxRef], contributionPct: top.proximityPct }],
      actions: [{ label: `Assign follow-up to ${top.owner}`, kind: "decision" }],
      evidenceRefs: [{ factId: proxRef, label: top.title, domain: top.domain, sourceView: "risk" }],
    };
  },

  "strategy.recentDecisions": (ds, ledger) => {
    if (ds.decisionLog.length === 0) {
      return notAnswerable("strategy.recentDecisions", "strategy", "No decisions have been logged yet.", "Becomes answerable the first time a decision is recorded in the decision log.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = ds.decisionLog.map((d) => {
      const factId = ledger.cite(`Decision: ${d.title}`, d.reversible ? 1 : 0, { unit: "count", domain: "strategy", sourceView: "decisions", confidence: "actual" });
      refs.push({ factId, label: d.title, domain: "strategy", sourceView: "decisions" });
      return { label: `${d.title} — ${d.decidedBy}, ${d.decidedAt}`, refs: [factId], contributionPct: null };
    });
    return {
      questionId: "strategy.recentDecisions", notAnswerable: false, domain: "strategy",
      headline: `${ds.decisionLog.length} decision${ds.decisionLog.length === 1 ? "" : "s"} recorded this week.`,
      trend: null, confidenceClass: "actual", drivers, actions: [], evidenceRefs: refs,
    };
  },

  // ---- Strategy -------------------------------------------------------------
  "strategy.objectivesOffTrack": (ds, ledger) => {
    const offTrack = ds.strategy.objectives.filter((o) => o.status !== "on_track");
    if (ds.strategy.objectives.length === 0) {
      return notAnswerable("strategy.objectivesOffTrack", "strategy", "No objectives have been set for this quarter.", "Set at least one objective with a target to track progress.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = offTrack.map((o) => {
      const factId = ledger.cite(`${o.title} — progress`, o.progressPct, { unit: "pct", domain: "strategy", sourceView: "strategy", confidence: o.confidence });
      refs.push({ factId, label: o.title, domain: "strategy", sourceView: "strategy" });
      return { label: `${o.title}: ${o.progressPct}% of ${o.targetPct}% target (owner ${o.ownerName})`, refs: [factId], contributionPct: o.progressPct - o.targetPct };
    });
    return {
      questionId: "strategy.objectivesOffTrack", notAnswerable: false, domain: "strategy",
      headline: offTrack.length === 0 ? `All ${ds.strategy.objectives.length} objectives are on track.` : `${offTrack.length} of ${ds.strategy.objectives.length} objectives are off track or at risk.`,
      trend: null, confidenceClass: offTrack[0]?.confidence ?? "evidence", drivers, actions: offTrack.map((o) => ({ label: `Review ${o.title} with ${o.ownerName}`, kind: "note" })), evidenceRefs: refs,
    };
  },

  "strategy.competitivePosition": (ds, ledger) => {
    const delta = ds.strategy.competitivePositionDeltaPts;
    if (delta === null) {
      return notAnswerable("strategy.competitivePosition", "strategy", "Competitive position scoring is not yet configured for this workspace.", "Wire a market/competitive-intel feed (Part 27) to enable this.");
    }
    const ref = ledger.cite("Competitive position delta", delta, { unit: "count", domain: "strategy", sourceView: "strategy", confidence: "evidence" });
    return {
      questionId: "strategy.competitivePosition", notAnswerable: false, domain: "strategy",
      headline: `Competitive position moved ${delta > 0 ? "+" : ""}${delta.toFixed(1)} points this quarter.`,
      trend: trendFrom(delta), confidenceClass: "evidence",
      drivers: [{ label: "Position delta", refs: [ref], contributionPct: null }], actions: [], evidenceRefs: [{ factId: ref, label: "Competitive position", domain: "strategy", sourceView: "strategy" }],
    };
  },

  "strategy.decisionDebt": (ds, ledger) => {
    if (ds.approvalsInbox.length === 0) {
      return notAnswerable("strategy.decisionDebt", "strategy", "There are no pending decisions, so there is no decision debt to measure.", "This is a true zero, not a gap.");
    }
    const overdue = ds.approvalsInbox.filter((a) => new Date(a.dueDate) < new Date(ds.asOf));
    const ref = ledger.cite("Overdue decisions", overdue.length, { unit: "count", domain: "strategy", sourceView: "decisions", confidence: "actual" });
    return {
      questionId: "strategy.decisionDebt", notAnswerable: false, domain: "strategy",
      headline: `${overdue.length} decision${overdue.length === 1 ? " is" : "s are"} overdue against its due date.`,
      trend: null, confidenceClass: "actual", drivers: [{ label: "Overdue count", refs: [ref], contributionPct: null }],
      actions: overdue.map((a) => ({ label: `Decide: ${a.title}`, kind: "decision", refId: a.id })), evidenceRefs: [{ factId: ref, label: "Overdue decisions", domain: "strategy", sourceView: "decisions" }],
    };
  },

  // ---- Finance ----------------------------------------------------------
  "finance.runway": (ds, ledger) => {
    const { runwayMonths, cashBalance } = ds.finance;
    const cashRef = ledger.cite("Cash balance", cashBalance, { unit: "usd", domain: "finance", sourceView: "finance", confidence: "actual" });
    const runwayRef = ledger.cite("Runway", runwayMonths, { unit: "months", domain: "finance", sourceView: "finance", confidence: "forecast" });
    return {
      questionId: "finance.runway", notAnswerable: false, domain: "finance",
      headline: `${runwayMonths.toFixed(1)} months of runway at the current burn rate, on ${formatCurrency(cashBalance)} cash.`,
      trend: null, confidenceClass: "forecast", drivers: [{ label: "Cash / burn", refs: [cashRef, runwayRef], contributionPct: null }],
      actions: runwayMonths < 6 ? [{ label: "Escalate: runway below 6 months", kind: "decision" }] : [],
      evidenceRefs: [{ factId: runwayRef, label: "Runway", domain: "finance", sourceView: "finance" }],
    };
  },

  "finance.marginTrend": (ds, ledger) => {
    const { grossMarginPct, grossMarginDeltaPts } = ds.finance;
    const ref = ledger.cite("Gross margin", grossMarginPct, { unit: "pct", domain: "finance", sourceView: "finance", confidence: "actual" });
    const deltaRef = ledger.cite("Gross margin delta", grossMarginDeltaPts, { unit: "pct", domain: "finance", sourceView: "finance", confidence: "actual" });
    return {
      questionId: "finance.marginTrend", notAnswerable: false, domain: "finance",
      headline: `Gross margin is ${grossMarginPct.toFixed(1)}%, ${grossMarginDeltaPts >= 0 ? "up" : "down"} ${Math.abs(grossMarginDeltaPts).toFixed(1)} points vs last month.`,
      trend: trendFrom(grossMarginDeltaPts), confidenceClass: "actual",
      drivers: [{ label: "Margin delta", refs: [ref, deltaRef], contributionPct: grossMarginDeltaPts }], actions: [],
      evidenceRefs: [{ factId: ref, label: "Gross margin", domain: "finance", sourceView: "finance" }],
    };
  },

  "finance.forecastRange": (ds, ledger) => {
    const f = ds.finance.forecastNextMonth;
    if (!f) {
      return notAnswerable("finance.forecastRange", "finance", "Not enough trailing history to run a forecast band yet.", "Needs at least 2 months of actuals to produce a P10/P50/P90 band.");
    }
    const p10 = ledger.cite("Revenue forecast P10", f.p10, { unit: "usd", domain: "finance", sourceView: "finance", confidence: "forecast" });
    const p50 = ledger.cite("Revenue forecast P50", f.p50, { unit: "usd", domain: "finance", sourceView: "finance", confidence: "forecast" });
    const p90 = ledger.cite("Revenue forecast P90", f.p90, { unit: "usd", domain: "finance", sourceView: "finance", confidence: "forecast" });
    return {
      questionId: "finance.forecastRange", notAnswerable: false, domain: "finance",
      headline: `Next month's revenue is forecast between ${formatCurrency(f.p10)} and ${formatCurrency(f.p90)}, median ${formatCurrency(f.p50)}.`,
      trend: null, confidenceClass: "forecast", interval: { p10: f.p10, p50: f.p50, p90: f.p90 },
      drivers: [{ label: "Forecast band", refs: [p10, p50, p90], contributionPct: null }], actions: [],
      evidenceRefs: [{ factId: p50, label: "Revenue forecast", domain: "finance", sourceView: "finance" }],
    } as QuestionAnswer;
  },

  // ---- People -------------------------------------------------------------
  "people.attritionRisk": (ds, ledger) => {
    if (ds.people.highRiskTeams.length === 0) {
      return notAnswerable("people.attritionRisk", "people", "No team currently scores above the attrition-risk watch threshold.", "This is a true zero given current data — nothing to unlock.");
    }
    const top = [...ds.people.highRiskTeams].sort((a, b) => b.attritionRiskScore - a.attritionRiskScore)[0];
    const ref = ledger.cite(`${top.teamName} attrition risk score`, top.attritionRiskScore, { unit: "score", domain: "people", sourceView: "people", confidence: "evidence" });
    return {
      questionId: "people.attritionRisk", notAnswerable: false, domain: "people",
      headline: `${top.teamName} has the highest attrition risk score at ${top.attritionRiskScore.toFixed(1)}/100 across its ${top.headcount} people.`,
      trend: null, confidenceClass: "evidence", drivers: [{ label: top.teamName, refs: [ref], contributionPct: null }],
      actions: [{ label: `Review retention plan for ${top.teamName}`, kind: "note" }], evidenceRefs: [{ factId: ref, label: top.teamName, domain: "people", sourceView: "people" }],
    };
  },

  "people.staffingVsPlan": (ds, ledger) => {
    const ref = ledger.cite("Open roles vs plan", ds.people.openRolesVsPlan, { unit: "count", domain: "people", sourceView: "people", confidence: "actual" });
    return {
      questionId: "people.staffingVsPlan", notAnswerable: false, domain: "people",
      headline: ds.people.openRolesVsPlan === 0 ? "Staffed exactly to plan." : `${Math.abs(ds.people.openRolesVsPlan)} ${ds.people.openRolesVsPlan < 0 ? "under" : "over"} plan on headcount.`,
      trend: null, confidenceClass: "actual", drivers: [{ label: "Open roles vs plan", refs: [ref], contributionPct: null }], actions: [],
      evidenceRefs: [{ factId: ref, label: "Staffing vs plan", domain: "people", sourceView: "people" }],
    };
  },

  "people.engagementTrend": (ds, ledger) => {
    if (ds.people.engagementScore === null) {
      return notAnswerable("people.engagementTrend", "people", "No engagement survey has been run yet.", "Run an engagement survey to populate this.");
    }
    const ref = ledger.cite("Engagement score", ds.people.engagementScore, { unit: "score", domain: "people", sourceView: "people", confidence: "evidence" });
    const deltaRef = ds.people.engagementDeltaPts !== null ? ledger.cite("Engagement delta", ds.people.engagementDeltaPts, { unit: "count", domain: "people", sourceView: "people", confidence: "evidence" }) : null;
    return {
      questionId: "people.engagementTrend", notAnswerable: false, domain: "people",
      headline: `Engagement score is ${ds.people.engagementScore.toFixed(0)}/100${ds.people.engagementDeltaPts !== null ? `, ${ds.people.engagementDeltaPts >= 0 ? "up" : "down"} ${Math.abs(ds.people.engagementDeltaPts)} points` : ""}.`,
      trend: trendFrom(ds.people.engagementDeltaPts), confidenceClass: "evidence",
      drivers: [{ label: "Engagement", refs: deltaRef ? [ref, deltaRef] : [ref], contributionPct: ds.people.engagementDeltaPts }], actions: [],
      evidenceRefs: [{ factId: ref, label: "Engagement score", domain: "people", sourceView: "people" }],
    };
  },

  // ---- Risk -----------------------------------------------------------------
  "risk.controlFailures": (ds, ledger) => {
    const failed = ds.risk.controlTests.filter((c) => c.result === "failed");
    if (ds.risk.controlTests.length === 0) {
      return notAnswerable("risk.controlFailures", "risk", "No control tests have been run yet.", "Schedule at least one control test to populate this.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = failed.map((c) => {
      const factId = ledger.cite(`${c.controlName} — result`, 0, { unit: "count", domain: "risk", sourceView: "risk", confidence: "actual" });
      refs.push({ factId, label: c.controlName, domain: "risk", sourceView: "risk" });
      return { label: `${c.controlName} (last run ${c.lastRunDate})`, refs: [factId], contributionPct: null };
    });
    return {
      questionId: "risk.controlFailures", notAnswerable: false, domain: "risk",
      headline: failed.length === 0 ? `All ${ds.risk.controlTests.length} control tests passed.` : `${failed.length} of ${ds.risk.controlTests.length} control tests failed.`,
      trend: null, confidenceClass: "actual", drivers, actions: failed.map((c) => ({ label: `Remediate: ${c.controlName}`, kind: "decision" })), evidenceRefs: refs,
    };
  },

  "risk.nearingThreshold": (ds, ledger) => {
    const near = ds.risk.items.filter((r) => r.proximityPct >= 85);
    if (ds.risk.items.length === 0) {
      return notAnswerable("risk.nearingThreshold", "risk", "No risk indicators are tracked yet.", "Add a risk indicator with a threshold to enable this.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = near.map((r) => {
      const factId = ledger.cite(`${r.title} — proximity`, r.proximityPct, { unit: "pct", domain: r.domain, sourceView: "risk", confidence: "actual" });
      refs.push({ factId, label: r.title, domain: r.domain, sourceView: "risk" });
      return { label: `${r.title}: ${r.proximityPct.toFixed(0)}% of threshold`, refs: [factId], contributionPct: r.proximityPct };
    });
    return {
      questionId: "risk.nearingThreshold", notAnswerable: false, domain: "risk",
      headline: near.length === 0 ? "No risk indicator is within 85% of its threshold." : `${near.length} risk indicator${near.length === 1 ? " is" : "s are"} within 85% of threshold.`,
      trend: null, confidenceClass: "actual", drivers, actions: [], evidenceRefs: refs,
    };
  },

  // ---- Operations ------------------------------------------------------
  "ops.milestonesOnTrack": (ds, ledger) => {
    if (ds.operations.milestones.length === 0) {
      return notAnswerable("ops.milestonesOnTrack", "operations", "No milestones are defined yet.", "Define at least one milestone with a due date.");
    }
    const late = ds.operations.milestones.filter((m) => m.status === "late");
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = ds.operations.milestones.map((m) => {
      const factId = ledger.cite(`${m.title} — days late`, m.daysLate, { unit: "days", domain: "operations", sourceView: "operations", confidence: "actual" });
      refs.push({ factId, label: m.title, domain: "operations", sourceView: "operations" });
      return { label: `${m.title}: ${m.status.replace("_", " ")}${m.daysLate > 0 ? `, ${m.daysLate.toFixed(0)} days late` : ""}`, refs: [factId], contributionPct: null };
    });
    return {
      questionId: "ops.milestonesOnTrack", notAnswerable: false, domain: "operations",
      headline: late.length === 0 ? `All ${ds.operations.milestones.length} milestones are on track or at risk (none late).` : `${late.length} milestone${late.length === 1 ? " is" : "s are"} late.`,
      trend: null, confidenceClass: "actual", drivers, actions: late.map((m) => ({ label: `Unblock: ${m.title}`, kind: "note" })), evidenceRefs: refs,
    };
  },

  "ops.cycleTime": (ds, ledger) => {
    const { cycleTimeDaysActual, cycleTimeDaysPlan } = ds.operations;
    if (cycleTimeDaysActual === 0 && cycleTimeDaysPlan === 0) {
      return notAnswerable("ops.cycleTime", "operations", "No cycle-time data has accumulated yet.", "Needs at least one completed delivery cycle.");
    }
    const deltaDays = cycleTimeDaysActual - cycleTimeDaysPlan;
    const ref = ledger.cite("Cycle time (actual)", cycleTimeDaysActual, { unit: "days", domain: "operations", sourceView: "operations", confidence: "actual" });
    const planRef = ledger.cite("Cycle time (plan)", cycleTimeDaysPlan, { unit: "days", domain: "operations", sourceView: "operations", confidence: "evidence" });
    return {
      questionId: "ops.cycleTime", notAnswerable: false, domain: "operations",
      headline: `Cycle time is ${cycleTimeDaysActual.toFixed(1)} days vs a ${cycleTimeDaysPlan.toFixed(1)}-day plan (${deltaDays >= 0 ? "+" : ""}${deltaDays.toFixed(1)} days).`,
      trend: trendFrom(deltaDays), confidenceClass: "actual",
      drivers: [{ label: "Cycle time delta", refs: [ref, planRef], contributionPct: null }], actions: [],
      evidenceRefs: [{ factId: ref, label: "Cycle time", domain: "operations", sourceView: "operations" }],
    };
  },

  // ---- Market -----------------------------------------------------------
  "market.shareOfVoice": (ds, ledger) => {
    if (ds.market.shareOfVoicePct === null) {
      return notAnswerable("market.shareOfVoice", "market", "Share-of-voice tracking is not configured for this workspace.", "Connect a market-intel feed (Part 27) to enable this.");
    }
    const ref = ledger.cite("Share of voice", ds.market.shareOfVoicePct, { unit: "pct", domain: "market", sourceView: "market", confidence: "evidence" });
    return {
      questionId: "market.shareOfVoice", notAnswerable: false, domain: "market",
      headline: `Share of voice is ${ds.market.shareOfVoicePct.toFixed(1)}%${ds.market.shareOfVoiceDeltaPts !== null ? `, ${ds.market.shareOfVoiceDeltaPts >= 0 ? "up" : "down"} ${Math.abs(ds.market.shareOfVoiceDeltaPts).toFixed(1)} points` : ""}.`,
      trend: trendFrom(ds.market.shareOfVoiceDeltaPts), confidenceClass: "evidence",
      drivers: [{ label: "Share of voice", refs: [ref], contributionPct: ds.market.shareOfVoiceDeltaPts }], actions: [],
      evidenceRefs: [{ factId: ref, label: "Share of voice", domain: "market", sourceView: "market" }],
    };
  },

  "market.sentiment": (ds, ledger) => {
    if (ds.market.sentimentScore === null) {
      return notAnswerable("market.sentiment", "market", "No sentiment feed is connected for this workspace yet.", "Connect a review/social sentiment feed to enable this.");
    }
    const ref = ledger.cite("Sentiment score", ds.market.sentimentScore, { unit: "count", domain: "market", sourceView: "market", confidence: "evidence" });
    return {
      questionId: "market.sentiment", notAnswerable: false, domain: "market",
      headline: `Customer sentiment is ${ds.market.sentimentScore.toFixed(0)} (scale -100 to 100)${ds.market.sentimentDeltaPts !== null ? `, ${ds.market.sentimentDeltaPts >= 0 ? "up" : "down"} ${Math.abs(ds.market.sentimentDeltaPts)} points` : ""}.`,
      trend: trendFrom(ds.market.sentimentDeltaPts), confidenceClass: "evidence",
      drivers: [{ label: "Sentiment", refs: [ref], contributionPct: ds.market.sentimentDeltaPts }],
      actions: ds.market.sentimentDeltaPts !== null && ds.market.sentimentDeltaPts < -3 ? [{ label: "Review recent sentiment drivers", kind: "note" }] : [],
      evidenceRefs: [{ factId: ref, label: "Sentiment", domain: "market", sourceView: "market" }],
    };
  },

  "market.competitorMoves": (ds, ledger) => {
    if (ds.market.competitorSignals.length === 0) {
      return notAnswerable("market.competitorMoves", "market", "No competitor signals have been captured yet.", "Connect a market-intel feed (Part 27) to enable this.");
    }
    const refs: EvidenceRef[] = [];
    const drivers: Driver[] = ds.market.competitorSignals.map((c) => {
      const factId = ledger.cite(`${c.competitorName} — signal`, c.deltaPts ?? 0, { unit: "count", domain: "market", sourceView: "market", confidence: "evidence" });
      refs.push({ factId, label: c.competitorName, domain: "market", sourceView: "market" });
      return { label: `${c.competitorName}: ${c.signal}`, refs: [factId], contributionPct: c.deltaPts };
    });
    return {
      questionId: "market.competitorMoves", notAnswerable: false, domain: "market",
      headline: `${ds.market.competitorSignals.length} competitor signal${ds.market.competitorSignals.length === 1 ? "" : "s"} captured this period.`,
      trend: null, confidenceClass: "evidence", drivers, actions: [], evidenceRefs: refs,
    };
  },
};

export function compileAnswer(questionId: string, ds: OrgDataset, ledger: FactLedger): AnswerResult {
  const compiler = COMPILERS[questionId];
  if (!compiler) {
    return notAnswerable(questionId, "operations", `"${questionId}" is not in the 20-question ontology.`, "Add a compiler for this question id.");
  }
  return compiler(ds, ledger);
}

export function compileAllAnswers(ds: OrgDataset, ledger: FactLedger): AnswerResult[] {
  return Object.keys(COMPILERS).map((id) => compileAnswer(id, ds, ledger));
}
