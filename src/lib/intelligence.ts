import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_growth_plans,
  leados_work_queue,
  leados_metrics,
  leados_playbooks,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

const DAY = 24 * 60 * 60 * 1000;

export type Severity = 1 | 2 | 3 | 4 | 5;
export type Domain = "people" | "finance" | "sales" | "ops" | "strategy";

export interface Finding {
  key: string;
  rule: string;
  domain: Domain;
  sev: Severity;
  personId?: number;
  personName?: string;
  title: string;
  detail: string;
}

type MetricRow = typeof leados_metrics.$inferSelect;
type EventDataRecord = Record<string, unknown>;

function asData(d: unknown): EventDataRecord {
  return (d ?? {}) as EventDataRecord;
}

// Helper: latest metric value
function latestMetric(metrics: MetricRow[], key: string): number | null {
  const matches = metrics
    .filter((m) => m.key === key)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches.length ? matches[0].value : null;
}

function daysSince(d: Date, now: number) {
  return Math.floor((now - d.getTime()) / DAY);
}

export const SUGGESTED_ACTIONS: Record<string, string> = {
  MORALE_LOW: "Schedule focused 1:1. Discuss workload and wellbeing.",
  BURNOUT_COMPOUND: "Schedule focused 1:1. Discuss workload and wellbeing.",
  CADENCE_SLIP: "Log overdue 1:1 now. Commit to weekly cadence for 4 weeks.",
  DECISION_ESCALATE: "Force-resolve in next leadership sync. Owner must decide or delegate.",
  RUNWAY_LOW: "Emergency finance review. Extend runway or cut burn within 2 weeks.",
  PIPELINE_THIN: "Pipeline review with sales lead. Identify acceleration levers.",
  WIN_RATE_LOW: "Win-loss analysis. Competitive debrief on last 5 losses.",
  LTV_CAC_LOW: "Unit economics review. Identify cost reduction or LTV improvement paths.",
  CHURN_ELEVATED: "Churn analysis: identify cohort, reason, and rescue actions.",
};

// Default playbook steps per triggering rule — reused by the playbooks API.
export const PLAYBOOK_STEPS: Record<string, string[]> = {
  MORALE_LOW: [
    "Review last 3 pulse entries — identify the trend start date",
    "Schedule 1:1 within 24h — focus on listening, not solutions",
    "Identify 1-2 specific workload items to remove or defer",
    "Log the conversation outcome and agreed actions",
    "Set 7-day follow-up: log next pulse to track improvement",
  ],
  CADENCE_SLIP: [
    "Log the overdue 1:1 now (even a brief check-in counts)",
    "Identify what caused the slip — protect the next scheduled time",
    "Set recurring calendar block to protect the cadence",
    "Log commitment in growth plan",
  ],
  BURNOUT_COMPOUND: [
    'Immediate 1:1 — open with "How are you actually doing?"',
    "Map their current commitments — identify what can be removed",
    "Discuss 1 project to defer or delegate",
    "Agree on a specific load target for next 2 weeks",
    "Set daily check-in for 1 week (pulse logs)",
    "Review in 2 weeks — if no improvement, escalate to HR",
  ],
  DECISION_ESCALATE: [
    "Add to next leadership sync agenda — today",
    "Identify the specific blocker: information gap, stakeholder misalignment, or priority conflict",
    "Force a choice: decide, delegate, or explicitly defer with a hard deadline",
    "Log the decision outcome in LeadOS",
  ],
  RUNWAY_LOW: [
    "Emergency finance review: current burn rate vs revenue",
    "Model 3 scenarios: current path, -20% burn, +20% revenue",
    "Identify top 3 cost line items that could be reduced",
    "Identify top 3 revenue acceleration opportunities",
    "Decide: raise, cut, or grow — within 2 weeks",
    "Log decision and actions",
  ],
  PIPELINE_THIN: [
    "Pipeline review with sales lead — identify stuck deals",
    "Qualify: how many deals are actually closeable in 90d?",
    "Identify the top outbound channel that can accelerate",
    "Set a weekly pipeline review cadence",
    "Log the agreed acceleration actions",
  ],
  LTV_CAC_LOW: [
    "Pull unit economics: LTV, CAC, payback period by cohort",
    "Identify: is LTV too low (churn/expansion) or CAC too high (GTM efficiency)?",
    "Model 3 paths to LTV:CAC ≥ 3",
    "Assign owner and 30-day target per path",
    "Log decisions and track in metrics",
  ],
  default: [
    "Understand the finding: review the detail and source data",
    "Identify the root cause — what is driving this signal?",
    "Agree on the intervention — specific, time-bound, owned",
    "Log the action plan",
    "Set a review date — when will you know if it worked?",
  ],
};

export async function computeIntelligence() {
  const now = Date.now();

  const [people, events, growthPlans, metrics, pendingWork, openPlaybooks] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events),
    db.select().from(leados_growth_plans),
    db.select().from(leados_metrics),
    db.select().from(leados_work_queue).where(eq(leados_work_queue.status, "pending")),
    db.select().from(leados_playbooks).where(eq(leados_playbooks.status, "open")),
  ]);

  const findings: Finding[] = [];
  const openPlans = growthPlans
    .filter((p) => p.status === "open")
    .map((p) => ({ ...p, daysSinceCheckin: daysSince(p.lastCheckinAt, now) }));

  const eventsFor = (personId: number, type?: string) =>
    events.filter((e) => e.personId === personId && (!type || e.type === type));

  // ===================== PEOPLE DOMAIN (12 rules) =====================
  people.forEach((p) => {
    const pulses = eventsFor(p.id, "pulse").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const oneOnOnes = eventsFor(p.id, "oneonone").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const feedback = eventsFor(p.id, "feedback").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const tasks14d = eventsFor(p.id, "task_assigned").filter((e) => now - e.createdAt.getTime() < 14 * DAY);
    const tasksPrev14d = eventsFor(p.id, "task_assigned").filter(
      (e) => now - e.createdAt.getTime() >= 14 * DAY && now - e.createdAt.getTime() < 28 * DAY,
    );
    const personAgeDays = daysSince(p.createdAt, now);

    // R-MORALE: last pulse mood low
    if (pulses.length) {
      const mood = Number(asData(pulses[0].data).mood ?? 3);
      if (mood <= 2) {
        findings.push({
          key: `MORALE_LOW:${p.id}`, rule: "MORALE_LOW", domain: "people",
          sev: mood <= 1 ? 5 : 3, personId: p.id, personName: p.name,
          title: `Low morale signal: ${p.name}`,
          detail: `Latest pulse mood is ${mood}/5, logged ${daysSince(pulses[0].createdAt, now)}d ago.`,
        });
      }
    }

    // R-CADENCE: 1:1 cadence slip
    const lastOneOnOne = oneOnOnes[0];
    const cadenceDays = lastOneOnOne ? daysSince(lastOneOnOne.createdAt, now) : personAgeDays;
    if (cadenceDays > 14) {
      findings.push({
        key: `CADENCE_SLIP:${p.id}`, rule: "CADENCE_SLIP", domain: "people",
        sev: cadenceDays > 28 ? 4 : cadenceDays > 21 ? 3 : 2, personId: p.id, personName: p.name,
        title: `1:1 cadence slipping: ${p.name}`,
        detail: lastOneOnOne
          ? `Last 1:1 was ${cadenceDays}d ago. Target cadence is weekly.`
          : `No 1:1 ever logged in ${cadenceDays}d since joining.`,
      });
    }

    // R-LOAD: load high
    if (tasks14d.length >= 8) {
      findings.push({
        key: `LOAD_HIGH:${p.id}`, rule: "LOAD_HIGH", domain: "people",
        sev: tasks14d.length >= 14 ? 4 : 3, personId: p.id, personName: p.name,
        title: `High task load: ${p.name}`,
        detail: `${tasks14d.length} tasks assigned in the last 14 days.`,
      });
    }

    // R-LOAD-TREND: load increased sharply vs prior period
    if (tasksPrev14d.length >= 3 && tasks14d.length > tasksPrev14d.length * 1.5) {
      findings.push({
        key: `LOAD_TREND_UP:${p.id}`, rule: "LOAD_TREND_UP", domain: "people",
        sev: 3, personId: p.id, personName: p.name,
        title: `Task load climbing fast: ${p.name}`,
        detail: `${tasksPrev14d.length} → ${tasks14d.length} tasks period over period.`,
      });
    }

    // R-ONE-ON-ONE-NEVER
    if (oneOnOnes.length === 0 && personAgeDays > 14) {
      findings.push({
        key: `ONE_ON_ONE_NEVER:${p.id}`, rule: "ONE_ON_ONE_NEVER", domain: "people",
        sev: 3, personId: p.id, personName: p.name,
        title: `No 1:1 ever logged: ${p.name}`,
        detail: `${p.name} has been on the roster for ${personAgeDays}d with zero 1:1s recorded.`,
      });
    }

    // R-NEW-HIRE-NO-CHECKIN
    if (personAgeDays <= 14 && oneOnOnes.length === 0) {
      findings.push({
        key: `NEW_HIRE_NO_CHECKIN:${p.id}`, rule: "NEW_HIRE_NO_CHECKIN", domain: "people",
        sev: 3, personId: p.id, personName: p.name,
        title: `New hire missing onboarding check-in: ${p.name}`,
        detail: `Joined ${personAgeDays}d ago with no 1:1 logged yet.`,
      });
    }

    // R-PULSE-MISSING
    const recentPulse = pulses.find((e) => now - e.createdAt.getTime() < 14 * DAY);
    if (!recentPulse && personAgeDays > 14) {
      findings.push({
        key: `PULSE_MISSING:${p.id}`, rule: "PULSE_MISSING", domain: "people",
        sev: 2, personId: p.id, personName: p.name,
        title: `No pulse check in 14 days: ${p.name}`,
        detail: `Mood/pulse tracking has gone quiet for ${p.name}.`,
      });
    }

    // R-MOOD-DECLINE-TREND
    if (pulses.length >= 3) {
      const [m0, m1, m2] = pulses.slice(0, 3).map((e) => Number(asData(e.data).mood ?? 3));
      if (m0 < m1 && m1 < m2) {
        findings.push({
          key: `MOOD_DECLINE_TREND:${p.id}`, rule: "MOOD_DECLINE_TREND", domain: "people",
          sev: 3, personId: p.id, personName: p.name,
          title: `Mood trending down: ${p.name}`,
          detail: `Last 3 pulses: ${m2} → ${m1} → ${m0}.`,
        });
      }
    }

    // R-NEGATIVE-FEEDBACK-STREAK
    if (feedback.length >= 3) {
      const last3 = feedback.slice(0, 3);
      if (last3.every((e) => asData(e.data).sentiment === "negative")) {
        findings.push({
          key: `NEGATIVE_FEEDBACK_STREAK:${p.id}`, rule: "NEGATIVE_FEEDBACK_STREAK", domain: "people",
          sev: 4, personId: p.id, personName: p.name,
          title: `3 consecutive negative feedback entries: ${p.name}`,
          detail: `Pattern of negative feedback detected without any positive signal between.`,
        });
      }
    }

    // R-FEEDBACK-SILENCE
    if (feedback.length === 0 && personAgeDays > 30) {
      findings.push({
        key: `FEEDBACK_SILENCE:${p.id}`, rule: "FEEDBACK_SILENCE", domain: "people",
        sev: 2, personId: p.id, personName: p.name,
        title: `No feedback ever logged: ${p.name}`,
        detail: `${personAgeDays}d on roster, zero feedback entries of any sentiment.`,
      });
    }
  });

  // R-BURNOUT: Same person MORALE_LOW + LOAD_HIGH → escalate combined sev
  const burnoutPeople = people.filter(
    (p) =>
      findings.some((f) => f.rule === "MORALE_LOW" && f.personId === p.id) &&
      findings.some((f) => f.rule === "LOAD_HIGH" && f.personId === p.id),
  );
  burnoutPeople.forEach((p) => {
    const moodFinding = findings.find((f) => f.rule === "MORALE_LOW" && f.personId === p.id);
    const loadFinding = findings.find((f) => f.rule === "LOAD_HIGH" && f.personId === p.id);
    const combinedSev = Math.min(5, Math.max(moodFinding?.sev ?? 3, loadFinding?.sev ?? 3) + 1) as Severity;
    findings.push({
      key: `BURNOUT_COMPOUND:${p.id}`, rule: "BURNOUT_COMPOUND", domain: "people",
      sev: combinedSev, personId: p.id, personName: p.name,
      title: `Burnout compound signal: ${p.name}`,
      detail: `Low morale (${moodFinding?.detail}) AND high load (${loadFinding?.detail}) co-occurring.`,
    });
  });

  // R-RECOGNITION: person has 4+ 1:1s but no positive feedback in 60d
  people.forEach((p) => {
    const oneOnOnes = events.filter((e) => e.type === "oneonone" && e.personId === p.id);
    const positiveFeedback = events.filter(
      (e) =>
        e.type === "feedback" &&
        e.personId === p.id &&
        asData(e.data).sentiment === "positive" &&
        now - e.createdAt.getTime() < 60 * DAY,
    );
    if (oneOnOnes.length >= 4 && positiveFeedback.length === 0) {
      findings.push({
        key: `RECOGNITION_GAP:${p.id}`, rule: "RECOGNITION_GAP", domain: "people",
        sev: 2, personId: p.id, personName: p.name,
        title: `Recognition gap for ${p.name}`,
        detail: `${oneOnOnes.length} 1:1s logged, no positive feedback in 60 days.`,
      });
    }
  });

  // ===================== GROWTH PLANS (4 rules) =====================
  openPlans.forEach((plan) => {
    if (plan.daysSinceCheckin > 30) {
      findings.push({
        key: `GROWTH_STALLED:${plan.id}`, rule: "GROWTH_STALLED", domain: "people",
        sev: plan.daysSinceCheckin > 50 ? 4 : 3,
        personId: plan.personId ?? undefined,
        personName: people.find((p) => p.id === plan.personId)?.name,
        title: `Growth plan stalled: ${plan.title}`,
        detail: `No check-in in ${plan.daysSinceCheckin} days.`,
      });
    }
  });
  // Escalation pass: plans stalled >50d are bumped to sev 4 (kept explicit per spec).
  openPlans.forEach((plan) => {
    if (plan.daysSinceCheckin > 50) {
      const existing = findings.find((f) => f.key === `GROWTH_STALLED:${plan.id}`);
      if (existing) existing.sev = 4;
    }
  });

  people.forEach((p) => {
    const hasPlan = growthPlans.some((g) => g.personId === p.id);
    if (!hasPlan && daysSince(p.createdAt, now) > 21) {
      findings.push({
        key: `GROWTH_PLAN_MISSING:${p.id}`, rule: "GROWTH_PLAN_MISSING", domain: "people",
        sev: 2, personId: p.id, personName: p.name,
        title: `No growth plan: ${p.name}`,
        detail: `No growth plan has been created for ${p.name}.`,
      });
    }
  });

  openPlans.forEach((plan) => {
    if (plan.daysSinceCheckin > 21 && plan.daysSinceCheckin <= 30) {
      findings.push({
        key: `GROWTH_REVIEW_OVERDUE:${plan.id}`, rule: "GROWTH_REVIEW_OVERDUE", domain: "people",
        sev: 2,
        personId: plan.personId ?? undefined,
        personName: people.find((p) => p.id === plan.personId)?.name,
        title: `Growth plan review overdue: ${plan.title}`,
        detail: `Check-in due — last one was ${plan.daysSinceCheckin} days ago.`,
      });
    }
  });

  const completedPlans = growthPlans.filter((g) => g.status === "completed").length;
  const totalPlans = growthPlans.length;
  if (totalPlans >= 4 && completedPlans / totalPlans < 0.25) {
    findings.push({
      key: "GROWTH_COMPLETION_LOW", rule: "GROWTH_COMPLETION_LOW", domain: "people",
      sev: 2,
      title: "Growth plan completion rate low",
      detail: `Only ${completedPlans}/${totalPlans} growth plans completed (${Math.round((completedPlans / totalPlans) * 100)}%).`,
    });
  }

  // ===================== STRATEGY / DECISIONS (6 rules) =====================
  const decisionEvents = events.filter((e) => e.type === "decision");
  const openDecisions = decisionEvents.filter((e) => asData(e.data).status !== "resolved");

  openDecisions.forEach((e) => {
    const ageDays = daysSince(e.createdAt, now);
    const topic = String(asData(e.data).topic ?? "Untitled decision");
    if (ageDays > 7) {
      findings.push({
        key: `DECISION_ESCALATE:${e.id}`, rule: "DECISION_ESCALATE", domain: "strategy",
        sev: ageDays > 14 ? 4 : 3,
        title: `Decision unresolved: ${topic}`,
        detail: `Open for ${ageDays} days without resolution.`,
      });
    }
    if (ageDays > 21) {
      findings.push({
        key: `DECISION_AGE_CRITICAL:${e.id}`, rule: "DECISION_AGE_CRITICAL", domain: "strategy",
        sev: 5,
        title: `Decision critically overdue: ${topic}`,
        detail: `Open for ${ageDays} days — this is actively blocking progress.`,
      });
    }
  });

  if (openDecisions.length >= 5) {
    findings.push({
      key: "DECISION_BACKLOG_HIGH", rule: "DECISION_BACKLOG_HIGH", domain: "strategy",
      sev: openDecisions.length >= 8 ? 4 : 3,
      title: `${openDecisions.length} open decisions in backlog`,
      detail: `Decision backlog is growing. Dedicate a session to clearing it.`,
    });
  }

  const strategyEvents = events.filter((e) => e.domain === "strategy" && now - e.createdAt.getTime() < 30 * DAY);
  if (strategyEvents.length === 0) {
    findings.push({
      key: "STRATEGY_SILENCE", rule: "STRATEGY_SILENCE", domain: "strategy",
      sev: 2,
      title: "No strategic activity logged in 30 days",
      detail: "No strategy events recorded. Are OKRs being reviewed? Is direction being discussed?",
    });
  }

  const lastOkrReview = events
    .filter((e) => e.type === "okr_review")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const okrAge = lastOkrReview ? daysSince(lastOkrReview.createdAt, now) : null;
  if (okrAge === null || okrAge > 45) {
    findings.push({
      key: "OKR_STALE", rule: "OKR_STALE", domain: "strategy",
      sev: okrAge !== null && okrAge > 90 ? 4 : 2,
      title: "OKRs stale",
      detail: okrAge !== null ? `Last OKR review was ${okrAge} days ago.` : "No OKR review has ever been logged.",
    });
  }

  const meetings7d = events.filter((e) => e.type === "meeting" && now - e.createdAt.getTime() < 7 * DAY);
  if (meetings7d.length >= 15) {
    findings.push({
      key: "MEETING_OVERLOAD", rule: "MEETING_OVERLOAD", domain: "strategy",
      sev: 2,
      title: "Meeting load is high org-wide",
      detail: `${meetings7d.length} meetings logged in the last 7 days.`,
    });
  }

  // ===================== FINANCE (6 rules) =====================
  const runway = latestMetric(metrics, "runway_months");
  if (runway !== null && runway < 12) {
    const sev: Severity = runway < 3 ? 5 : runway < 6 ? 4 : 3;
    findings.push({
      key: "RUNWAY_LOW", rule: "RUNWAY_LOW", domain: "finance", sev,
      title: `Runway at ${runway} months`,
      detail: `${runway < 6 ? "Critical: under 6 months." : "Warning: under 12 months."} Action required.`,
    });
  }

  const mrrGrowth = latestMetric(metrics, "mrr_growth_pct");
  if (mrrGrowth !== null && mrrGrowth < 0) {
    findings.push({
      key: "MRR_DECLINING", rule: "MRR_DECLINING", domain: "finance",
      sev: mrrGrowth < -10 ? 4 : 3,
      title: `MRR growth negative at ${mrrGrowth}%`,
      detail: `Revenue base is contracting. Review churn and expansion.`,
    });
  }

  const ltvCac = latestMetric(metrics, "ltv_cac");
  if (ltvCac !== null && ltvCac < 3) {
    findings.push({
      key: "LTV_CAC_LOW", rule: "LTV_CAC_LOW", domain: "finance",
      sev: ltvCac < 1 ? 5 : ltvCac < 2 ? 4 : 3,
      title: `LTV:CAC at ${ltvCac} (target ≥3)`,
      detail: `Unit economics unviable. ${ltvCac < 1 ? "Critical: acquiring customers at a loss." : "Growth spending may not be recoverable."}`,
    });
  }

  const burnMultiple = latestMetric(metrics, "burn_multiple");
  if (burnMultiple !== null && burnMultiple > 2) {
    findings.push({
      key: "BURN_MULTIPLE_HIGH", rule: "BURN_MULTIPLE_HIGH", domain: "finance",
      sev: burnMultiple > 4 ? 4 : 3,
      title: `Burn multiple at ${burnMultiple}x`,
      detail: `Spending ${burnMultiple}x per dollar of net new revenue — efficiency is slipping.`,
    });
  }

  const cashBuffer = latestMetric(metrics, "cash_buffer_months");
  if (cashBuffer !== null && cashBuffer < 3) {
    findings.push({
      key: "CASH_BUFFER_LOW", rule: "CASH_BUFFER_LOW", domain: "finance",
      sev: cashBuffer < 1 ? 5 : 4,
      title: `Cash buffer at ${cashBuffer} months`,
      detail: `Operating cash cushion is thin. Tighten payment terms and reserves.`,
    });
  }

  const expenseGrowth = latestMetric(metrics, "expense_growth_pct");
  if (expenseGrowth !== null && expenseGrowth > 25) {
    findings.push({
      key: "EXPENSE_SPIKE", rule: "EXPENSE_SPIKE", domain: "finance",
      sev: expenseGrowth > 50 ? 4 : 3,
      title: `Expenses up ${expenseGrowth}% period over period`,
      detail: `Review new recurring spend commitments and vendor contracts.`,
    });
  }

  // ===================== SALES (6 rules) =====================
  const pipeline = latestMetric(metrics, "pipeline_coverage_x");
  if (pipeline !== null && pipeline < 3) {
    findings.push({
      key: "PIPELINE_THIN", rule: "PIPELINE_THIN", domain: "sales",
      sev: pipeline < 1.5 ? 5 : pipeline < 2 ? 4 : 3,
      title: `Pipeline coverage at ${pipeline}× (target ≥3×)`,
      detail: `Insufficient pipeline to cover revenue targets. GTM intervention needed.`,
    });
  }

  const winRate = latestMetric(metrics, "win_rate_pct");
  if (winRate !== null && winRate < 30) {
    findings.push({
      key: "WIN_RATE_LOW", rule: "WIN_RATE_LOW", domain: "sales",
      sev: winRate < 20 ? 4 : 3,
      title: `Win rate at ${winRate}% (below 30% threshold)`,
      detail: `Review competitive positioning, qualification process, and proposal quality.`,
    });
  }

  const churn = latestMetric(metrics, "churn_pct");
  if (churn !== null && churn > 2) {
    findings.push({
      key: "CHURN_ELEVATED", rule: "CHURN_ELEVATED", domain: "sales",
      sev: churn > 5 ? 5 : churn > 3 ? 4 : 2,
      title: `Churn at ${churn}% MRR (threshold: 2%)`,
      detail: `Elevated churn is destroying unit economics. Root cause: review support, product, pricing.`,
    });
  }

  const nps = latestMetric(metrics, "nps");
  if (nps !== null && nps < 30) {
    findings.push({
      key: "NPS_LOW", rule: "NPS_LOW", domain: "sales",
      sev: nps < 0 ? 4 : 2,
      title: `NPS at ${nps} (below 30)`,
      detail: `Customer satisfaction signal is weak — investigate detractor themes.`,
    });
  }

  const salesCycleDelta = latestMetric(metrics, "sales_cycle_days_delta_pct");
  if (salesCycleDelta !== null && salesCycleDelta > 20) {
    findings.push({
      key: "SALES_CYCLE_LENGTHENING", rule: "SALES_CYCLE_LENGTHENING", domain: "sales",
      sev: salesCycleDelta > 40 ? 4 : 3,
      title: `Sales cycle lengthened ${salesCycleDelta}%`,
      detail: `Deals are taking longer to close — review qualification and friction points.`,
    });
  }

  const dealEvents = events.filter((e) => e.type === "deal");
  const stalledDeals = dealEvents.filter((e) => Number(asData(e.data).daysInStage ?? 0) > 30);
  if (stalledDeals.length >= 2) {
    findings.push({
      key: "DEAL_STALL", rule: "DEAL_STALL", domain: "sales",
      sev: stalledDeals.length >= 5 ? 4 : 3,
      title: `${stalledDeals.length} deals stalled in stage 30+ days`,
      detail: `Stalled deals risk slipping or dying silently. Review with sales lead.`,
    });
  }

  // ===================== OPS (6 rules) =====================
  const deployDelta = latestMetric(metrics, "deploy_freq_delta_pct");
  if (deployDelta !== null && deployDelta < -30) {
    findings.push({
      key: "DEPLOY_DECLINE", rule: "DEPLOY_DECLINE", domain: "ops",
      sev: deployDelta < -50 ? 4 : 3,
      title: `Deploy frequency down ${Math.abs(deployDelta)}%`,
      detail: `Delivery throughput declining. Check: tech debt, team capacity, process friction.`,
    });
  }

  const incidents14d = events.filter((e) => e.type === "incident" && now - e.createdAt.getTime() < 14 * DAY);
  if (incidents14d.length >= 3) {
    findings.push({
      key: "INCIDENT_SPIKE", rule: "INCIDENT_SPIKE", domain: "ops",
      sev: incidents14d.length >= 6 ? 5 : incidents14d.length >= 4 ? 4 : 3,
      title: `${incidents14d.length} incidents in 14 days`,
      detail: `Incident rate is elevated. Run a blameless retro and look for a common root cause.`,
    });
  }

  const openTickets = events.filter((e) => e.type === "support_ticket" && asData(e.data).status !== "closed");
  if (openTickets.length >= 10) {
    findings.push({
      key: "SUPPORT_BACKLOG", rule: "SUPPORT_BACKLOG", domain: "ops",
      sev: openTickets.length >= 25 ? 4 : 3,
      title: `${openTickets.length} open support tickets`,
      detail: `Support backlog is building — consider surge staffing or triage sweep.`,
    });
  }

  const onCallEvents14d = events.filter(
    (e) => e.type === "incident" && asData(e.data).afterHours === true && now - e.createdAt.getTime() < 14 * DAY,
  );
  if (onCallEvents14d.length >= 3) {
    findings.push({
      key: "ON_CALL_FATIGUE", rule: "ON_CALL_FATIGUE", domain: "ops",
      sev: 3,
      title: `${onCallEvents14d.length} after-hours incidents in 14 days`,
      detail: `On-call load is high. Review rotation fairness and alert quality.`,
    });
  }

  const codeReviewLag = latestMetric(metrics, "code_review_lag_hours");
  if (codeReviewLag !== null && codeReviewLag > 48) {
    findings.push({
      key: "CODE_REVIEW_LAG", rule: "CODE_REVIEW_LAG", domain: "ops",
      sev: codeReviewLag > 96 ? 4 : 3,
      title: `Code review lag at ${codeReviewLag}h`,
      detail: `PRs are sitting too long — review bottleneck is slowing delivery.`,
    });
  }

  const headcount = latestMetric(metrics, "headcount");
  const headcountTarget = latestMetric(metrics, "headcount_target");
  if (headcount !== null && headcountTarget !== null && headcount < headcountTarget * 0.8) {
    findings.push({
      key: "HEADCOUNT_GAP", rule: "HEADCOUNT_GAP", domain: "ops",
      sev: 3,
      title: `Headcount at ${headcount} vs target ${headcountTarget}`,
      detail: `Team is understaffed relative to plan — hiring plan needs attention.`,
    });
  }

  // ===================== AUTONOMOUS WORK QUEUE GENERATION =====================
  const criticalFindings = findings.filter((f) => f.sev >= 4);
  for (const finding of criticalFindings) {
    const alreadyQueued = pendingWork.some((w) => (w.data as EventDataRecord)?.findingKey === finding.key);
    if (alreadyQueued) continue;

    const suggestedAction = SUGGESTED_ACTIONS[finding.rule] ?? "Review and address finding with relevant stakeholder.";

    await db.insert(leados_work_queue).values({
      title: `Address: ${finding.title}`,
      type: "action",
      status: "pending",
      data: {
        findingKey: finding.key,
        rule: finding.rule,
        domain: finding.domain,
        personId: finding.personId ?? null,
        suggestedAction,
      },
    });
    await logAudit("WORK_ITEM_AUTO_CREATED", finding.key, { rule: finding.rule, sev: finding.sev });
    pendingWork.push({
      id: -1,
      title: `Address: ${finding.title}`,
      type: "action",
      status: "pending",
      data: { findingKey: finding.key },
      createdAt: new Date(),
    });
  }

  const metricsSnapshot: Record<string, number> = {};
  const seenKeys = new Set<string>();
  metrics
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .forEach((m) => {
      if (!seenKeys.has(m.key)) {
        seenKeys.add(m.key);
        metricsSnapshot[m.key] = m.value;
      }
    });

  findings.sort((a, b) => b.sev - a.sev);

  return {
    generatedAt: new Date().toISOString(),
    findings,
    metricsSnapshot,
    activePlaybooks: openPlaybooks.length,
    counts: {
      people: people.length,
      events: events.length,
      findings: findings.length,
      critical: findings.filter((f) => f.sev >= 4).length,
      pendingWork: pendingWork.length,
    },
  };
}
