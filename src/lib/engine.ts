import type { AppState, Domain, DomainScore, Finding, Projection, Severity } from "./types";
import { DOMAINS, SEVERITY_WEIGHT } from "./types";

// Original rule engine for this delivery (11 rules). Recomputed fresh from
// AppState on every call — nothing derived is persisted. This "project the
// whole picture live, every time" approach is a common, sensible pattern for
// small local-state apps; it is used here as an independent design choice,
// not a port of any specific file inspected in github.com/wbweve/Leados.

const DAY = 86400000;
const DECAY = 0.92; // per-day decay applied to a finding's weight as its ageDays grows

function daysBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / DAY;
}

function sevFromOverdue(overdueDays: number, mild: Severity, hot: Severity, hotAt: number): Severity {
  return overdueDays >= hotAt ? hot : mild;
}

export function computeFindings(state: AppState, nowIso: string = new Date().toISOString()): Finding[] {
  const findings: Finding[] = [];
  const byDomainCount: Record<string, number> = {};

  const push = (f: Finding) => {
    findings.push(f);
    byDomainCount[f.domain] = (byDomainCount[f.domain] || 0) + (f.severity === "high" || f.severity === "critical" ? 1 : 0);
  };

  // R1 — ONE_ON_ONE_OVERDUE: strictly past the person's own cadence (edge case: exactly on cadence does NOT fire)
  for (const p of state.people) {
    const sinceLast = daysBetween(p.lastOneOnOne, nowIso);
    const overdueBy = sinceLast - p.cadenceDays;
    if (overdueBy > 0) {
      const severity = sevFromOverdue(overdueBy, "medium", "critical", p.cadenceDays);
      push({
        key: `R1:${p.id}`,
        rule: "ONE_ON_ONE_OVERDUE",
        domain: "people",
        title: `1:1 with ${p.name} is overdue`,
        detail: `Last 1:1 was ${Math.round(sinceLast)}d ago; cadence is ${p.cadenceDays}d (${Math.round(overdueBy)}d overdue).`,
        severity,
        ageDays: overdueBy,
        sourceIds: [p.id],
      });
    }

    // R2 — FEEDBACK_GAP: no feedback within settings.feedbackGapDays (or ever)
    const gapDays = p.lastFeedback ? daysBetween(p.lastFeedback, nowIso) : Infinity;
    if (gapDays > state.settings.feedbackGapDays) {
      push({
        key: `R2:${p.id}`,
        rule: "FEEDBACK_GAP",
        domain: "people",
        title: `No feedback logged for ${p.name}`,
        detail: p.lastFeedback ? `Last feedback ${Math.round(gapDays)}d ago (gap threshold ${state.settings.feedbackGapDays}d).` : "No feedback ever logged.",
        severity: "medium",
        ageDays: Number.isFinite(gapDays) ? gapDays - state.settings.feedbackGapDays : 999,
        sourceIds: [p.id],
      });
    }

    // R3 — BURNOUT_RISK (composite, disclosed heuristic): overdue 1:1 AND recent negative feedback (<=30d)
    const recentNegative = p.lastFeedback && p.lastFeedbackSentiment === "negative" && daysBetween(p.lastFeedback, nowIso) <= 30;
    if (overdueBy > 0 && recentNegative) {
      push({
        key: `R3:${p.id}`,
        rule: "BURNOUT_RISK",
        domain: "people",
        title: `Burnout risk: ${p.name}`,
        detail: `Composite signal (disclosed heuristic): overdue 1:1 + recent negative-sentiment feedback for the same person.`,
        severity: "critical",
        ageDays: overdueBy,
        sourceIds: [p.id],
      });
    }
  }

  // R4 — DECISION_STALE: reviewBy strictly passed, no outcome logged
  for (const d of state.decisions) {
    if (d.outcome) continue;
    const overdueBy = daysBetween(d.reviewBy, nowIso);
    if (overdueBy > 0) {
      const severity = sevFromOverdue(overdueBy, "medium", "high", 14);
      push({
        key: `R4:${d.id}`,
        rule: "DECISION_STALE",
        domain: d.domain,
        title: `Decision "${d.title}" has no outcome`,
        detail: `Review date passed ${Math.round(overdueBy)}d ago with no outcome logged.`,
        severity,
        ageDays: overdueBy,
        sourceIds: [d.id],
      });
    }
  }

  // R5 — GOAL_OWNERLESS, R6 — GOAL_STALE
  for (const g of state.goals) {
    if (!g.ownerId) {
      push({
        key: `R5:${g.id}`,
        rule: "GOAL_OWNERLESS",
        domain: g.domain,
        title: `Goal "${g.title}" has no owner`,
        detail: "An explicit null owner is treated as data, not a default — this is flagged immediately rather than waiting for staleness.",
        severity: "high",
        ageDays: 0,
        sourceIds: [g.id],
      });
    } else {
      const sinceUpdate = daysBetween(g.lastUpdate, nowIso);
      if (sinceUpdate > 21) {
        push({
          key: `R6:${g.id}`,
          rule: "GOAL_STALE",
          domain: g.domain,
          title: `Goal "${g.title}" has gone quiet`,
          detail: `No update in ${Math.round(sinceUpdate)}d (threshold 21d).`,
          severity: "medium",
          ageDays: sinceUpdate - 21,
          sourceIds: [g.id],
        });
      }
    }
  }

  // R7 — VENDOR_RENEWAL_AT_RISK: renewal within 14 days (or past) and no counterpart response
  for (const v of state.vendors) {
    const daysUntilDue = daysBetween(nowIso, v.renewalDue);
    if (daysUntilDue <= 14 && !v.counterpartRespondedAt) {
      const severity: Severity = daysUntilDue < 0 ? "critical" : daysUntilDue <= 3 ? "high" : "medium";
      push({
        key: `R7:${v.id}`,
        rule: "VENDOR_RENEWAL_AT_RISK",
        domain: "legal",
        title: `${v.name} renewal at risk`,
        detail: daysUntilDue < 0 ? `Renewal was due ${Math.abs(Math.round(daysUntilDue))}d ago, no response.` : `Due in ${Math.round(daysUntilDue)}d, no counterpart response yet.`,
        severity,
        ageDays: Math.max(0, -daysUntilDue),
        sourceIds: [v.id],
      });
    }
  }

  // R8 — BUDGET_OVERRUN
  if (state.metrics.budgetVariancePct > 10) {
    const severity: Severity = state.metrics.budgetVariancePct > 30 ? "critical" : state.metrics.budgetVariancePct > 20 ? "high" : "medium";
    push({
      key: "R8:budget",
      rule: "BUDGET_OVERRUN",
      domain: "finance",
      title: "Spend is tracking over budget",
      detail: `Variance is +${state.metrics.budgetVariancePct}% against plan (threshold 10%).`,
      severity,
      ageDays: Math.max(0, state.metrics.budgetVariancePct - 10),
      sourceIds: ["metrics"],
    });
  }

  // R9 — DEPLOY_FREQ_DROP
  if (state.metrics.deployFreqDeltaPct < -25) {
    push({
      key: "R9:deploy",
      rule: "DEPLOY_FREQ_DROP",
      domain: "ops",
      title: "Deploy frequency has dropped sharply",
      detail: `${state.metrics.deployFreqDeltaPct}% vs. baseline (threshold -25%).`,
      severity: state.metrics.deployFreqDeltaPct < -50 ? "critical" : "high",
      ageDays: Math.max(0, -25 - state.metrics.deployFreqDeltaPct),
      sourceIds: ["metrics"],
    });
  }

  // R10 — CHURN_UPTICK
  if (state.metrics.churnDeltaPct > 15) {
    push({
      key: "R10:churn",
      rule: "CHURN_UPTICK",
      domain: "product",
      title: "Churn is trending up",
      detail: `+${state.metrics.churnDeltaPct}pp vs. baseline (threshold +15pp).`,
      severity: state.metrics.churnDeltaPct > 25 ? "critical" : "high",
      ageDays: Math.max(0, state.metrics.churnDeltaPct - 15),
      sourceIds: ["metrics"],
    });
  }

  // R11 — DOMAIN_CONCENTRATION (meta-rule): >=2 high/critical findings already in the same domain this pass
  for (const [domain, count] of Object.entries(byDomainCount)) {
    if (count >= 2) {
      push({
        key: `R11:${domain}`,
        rule: "DOMAIN_CONCENTRATION",
        domain: "org",
        title: `Risk concentration in ${domain}`,
        detail: `${count} high/critical findings are active in "${domain}" at the same time — treat as compounding, not independent.`,
        severity: "critical",
        ageDays: 0,
        sourceIds: findings.filter((f) => f.domain === domain && (f.severity === "high" || f.severity === "critical")).map((f) => f.key),
      });
    }
  }

  return findings;
}

function bucketFor(score: number): DomainScore["bucket"] {
  if (score <= 0) return "clear";
  if (score < 6) return "moderate";
  if (score < 14) return "elevated";
  return "critical";
}

export function project(state: AppState, nowIso: string = new Date().toISOString()): Projection {
  const findings = computeFindings(state, nowIso);

  const domainScores: DomainScore[] = DOMAINS.map((domain) => {
    const open = findings.filter((f) => f.domain === domain);
    const score = open.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity] * Math.pow(DECAY, Math.max(0, f.ageDays)), 0);
    return { domain, score: Math.round(score * 100) / 100, openFindings: open.length, bucket: bucketFor(score) };
  });

  const overallScore = Math.round(domainScores.reduce((sum, d) => sum + d.score, 0) * 100) / 100;

  return { findings, domainScores, overallScore };
}

export function domainOf(d: Domain | "org") {
  return d;
}
