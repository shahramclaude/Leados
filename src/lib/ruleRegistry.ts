// ════════════════════════════════════════════════════════════════════
// Signal Board 2.0 — Dynamic Rule Registry
// Replaces the static 50-rule catalog with an 80+ rule catalog whose
// thresholds and weights are designed to be mutated in place by the
// auto-calibration engine (src/lib/autoCalibrate.ts). Conditions close
// over the live `autoThresholds` object on the Rule itself, so once a
// calibration pass rewrites a threshold, the very same `condition`
// function immediately reflects the new behaviour — no rebuild needed.
// ════════════════════════════════════════════════════════════════════

export const MS_DAY = 86_400_000;

export type Domain = "people" | "finance" | "sales" | "ops" | "strategy";
export type Severity = 1 | 2 | 3 | 4 | 5;

export interface MetricPoint {
  ts: number; // epoch ms
  value: number;
}

export interface RuleEvent {
  type: string;
  ts: number; // epoch ms
  data?: Record<string, unknown>;
}

/** The full evaluation surface a rule condition is allowed to see. */
export interface RuleContext {
  /** Reference point used by daysSince/countInWindow/metric — lets us "replay" history. */
  now: number;
  /** Full time series per metric key, not pre-filtered to `now`. */
  metricHistory: Record<string, MetricPoint[]>;
  /** Full event log, not pre-filtered to `now`. */
  events: RuleEvent[];
}

// ─────────────────────────── Safe DSL primitives ───────────────────────────
// These are the exact three primitives exposed to the custom rule DSL
// (metric/daysSince/countInWindow) as well as to every built-in rule, so
// built-ins and user-authored rules share one evaluation semantics.

export function metric(ctx: RuleContext, key: string): number | undefined {
  const series = ctx.metricHistory[key];
  if (!series || series.length === 0) return undefined;
  let best: MetricPoint | undefined;
  for (const p of series) {
    if (p.ts <= ctx.now && (!best || p.ts > best.ts)) best = p;
  }
  return best?.value;
}

export function daysSince(ctx: RuleContext, eventType: string): number {
  const matches = ctx.events.filter((e) => e.type === eventType && e.ts <= ctx.now);
  if (matches.length === 0) return Infinity;
  const latest = Math.max(...matches.map((e) => e.ts));
  return (ctx.now - latest) / MS_DAY;
}

export function countInWindow(ctx: RuleContext, eventType: string, days: number): number {
  const floor = ctx.now - days * MS_DAY;
  return ctx.events.filter((e) => e.type === eventType && e.ts <= ctx.now && e.ts >= floor).length;
}

// ─────────────────────────── Rule type (per spec) ───────────────────────────

export interface RuleCalibration {
  truePositiveCount: number;
  falsePositiveCount: number;
  lastCalibrated: Date;
}

/** Metadata the mock data generator / calibration engine use to know
 * which metric or event a rule's threshold(s) are tied to. Populated
 * automatically for built-in rules, optional for custom DSL rules. */
export interface MetricRef {
  key: string;
  thresholdKey: string;
  direction: "gt" | "lt";
}
export interface EventRef {
  type: string;
  kind: "daysSince" | "countInWindow";
  thresholdKey: string;
  windowDays?: number;
}
export interface DataRefs {
  metrics: MetricRef[];
  events: EventRef[];
}

export interface Rule {
  id: string;
  name: string;
  domain: Domain;
  description: string;
  condition: (data: RuleContext) => boolean;
  severity: Severity;
  weight: number;
  calibration: RuleCalibration;
  autoThresholds: Record<string, number>;
  enabled: boolean;
  tags: string[];
  /** Extra fields needed by the Signal Board UI — additive, not in conflict with the base spec. */
  suggestedAction: string;
  evidence: (data: RuleContext) => string;
  dataRefs: DataRefs;
  isCustom?: boolean;
}

// ─────────────────────────── Rule compiler ───────────────────────────

interface BaseSpec {
  id: string;
  name: string;
  domain: Domain;
  description: string;
  severity: Severity;
  tags: string[];
  suggestedAction: string;
}

interface MetricSpec extends BaseSpec {
  kind: "gt" | "lt" | "gte" | "lte";
  metricKey: string;
  threshold: number;
}

interface DaysSinceSpec extends BaseSpec {
  kind: "daysSinceGt";
  eventType: string;
  threshold: number;
}

interface CountWindowSpec extends BaseSpec {
  kind: "countInWindowGte";
  eventType: string;
  windowDays: number;
  threshold: number;
}

interface CustomSpec extends BaseSpec {
  kind: "custom";
  autoThresholds: Record<string, number>;
  dataRefs: DataRefs;
  evaluate: (ctx: RuleContext, thresholds: Record<string, number>) => boolean;
  evidence: (ctx: RuleContext, thresholds: Record<string, number>) => string;
}

type RuleSpec = MetricSpec | DaysSinceSpec | CountWindowSpec | CustomSpec;

function compile(spec: RuleSpec): Rule {
  const rule: Rule = {
    id: spec.id,
    name: spec.name,
    domain: spec.domain,
    description: spec.description,
    severity: spec.severity,
    weight: spec.severity, // initial weight mirrors severity; diverges after calibration
    calibration: { truePositiveCount: 0, falsePositiveCount: 0, lastCalibrated: new Date() },
    autoThresholds: {},
    enabled: true,
    tags: spec.tags,
    suggestedAction: spec.suggestedAction,
    condition: () => false,
    evidence: () => "",
    dataRefs: { metrics: [], events: [] },
  };

  switch (spec.kind) {
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      rule.autoThresholds = { threshold: spec.threshold };
      rule.dataRefs = {
        metrics: [
          {
            key: spec.metricKey,
            thresholdKey: "threshold",
            direction: spec.kind === "gt" || spec.kind === "gte" ? "gt" : "lt",
          },
        ],
        events: [],
      };
      rule.condition = (ctx) => {
        const v = metric(ctx, spec.metricKey);
        if (v === undefined) return false;
        const t = rule.autoThresholds.threshold;
        if (spec.kind === "gt") return v > t;
        if (spec.kind === "gte") return v >= t;
        if (spec.kind === "lt") return v < t;
        return v <= t;
      };
      rule.evidence = (ctx) => {
        const v = metric(ctx, spec.metricKey);
        const t = rule.autoThresholds.threshold;
        return v === undefined
          ? `No data for ${spec.metricKey}`
          : `${spec.metricKey} = ${Math.round(v * 100) / 100} (threshold ${spec.kind === "gt" || spec.kind === "gte" ? ">" : "<"} ${Math.round(t * 100) / 100})`;
      };
      break;
    }
    case "daysSinceGt": {
      rule.autoThresholds = { days: spec.threshold };
      rule.dataRefs = { metrics: [], events: [{ type: spec.eventType, kind: "daysSince", thresholdKey: "days" }] };
      rule.condition = (ctx) => daysSince(ctx, spec.eventType) > rule.autoThresholds.days;
      rule.evidence = (ctx) => {
        const d = daysSince(ctx, spec.eventType);
        const text = Number.isFinite(d) ? `${Math.round(d)} days` : "no record";
        return `${text} since last "${spec.eventType}" (threshold > ${Math.round(rule.autoThresholds.days)}d)`;
      };
      break;
    }
    case "countInWindowGte": {
      rule.autoThresholds = { count: spec.threshold };
      rule.dataRefs = {
        metrics: [],
        events: [{ type: spec.eventType, kind: "countInWindow", thresholdKey: "count", windowDays: spec.windowDays }],
      };
      rule.condition = (ctx) => countInWindow(ctx, spec.eventType, spec.windowDays) >= rule.autoThresholds.count;
      rule.evidence = (ctx) => {
        const c = countInWindow(ctx, spec.eventType, spec.windowDays);
        return `${c}× "${spec.eventType}" in last ${spec.windowDays}d (threshold >= ${Math.round(rule.autoThresholds.count)})`;
      };
      break;
    }
    case "custom": {
      rule.autoThresholds = { ...spec.autoThresholds };
      rule.dataRefs = spec.dataRefs;
      rule.condition = (ctx) => spec.evaluate(ctx, rule.autoThresholds);
      rule.evidence = (ctx) => spec.evidence(ctx, rule.autoThresholds);
      break;
    }
  }

  return rule;
}

// ════════════════════════════ PEOPLE (20) ════════════════════════════

const peopleSpecs: RuleSpec[] = [
  {
    id: "P01", name: "1:1 cadence slip", domain: "people", severity: 3,
    description: "A manager has gone well past their stated 1:1 cadence with a direct report.",
    tags: ["people", "cadence", "manager"], suggestedAction: "Re-schedule the overdue 1:1 this week.",
    kind: "daysSinceGt", eventType: "oneonone_held", threshold: 14,
  },
  {
    id: "P02", name: "Morale trend down 3+ weeks", domain: "people", severity: 4,
    description: "Pulse/morale scores have trended downward for three or more consecutive weeks.",
    tags: ["people", "morale", "trend"], suggestedAction: "Run a listening session; review workload distribution.",
    kind: "gte", metricKey: "morale_trend_weeks_down", threshold: 3,
  },
  {
    id: "P03", name: "Flight risk composite", domain: "people", severity: 4,
    description: "Composite flight-risk score (mood, cadence, conflicts, growth plan) crosses risk threshold.",
    tags: ["people", "retention", "composite"], suggestedAction: "Schedule a retention conversation with the manager.",
    kind: "gt", metricKey: "flight_risk_score", threshold: 0.6,
  },
  {
    id: "P04", name: "Promotion readiness stalled", domain: "people", severity: 3,
    description: "A promotion-ready case has had no review activity in a long time.",
    tags: ["people", "career"], suggestedAction: "Resume the promotion review cycle with calibration committee.",
    kind: "daysSinceGt", eventType: "promotion_review_update", threshold: 120,
  },
  {
    id: "P05", name: "Feedback frequency low", domain: "people", severity: 2,
    description: "Too little feedback has been exchanged in the trailing 30 days.",
    tags: ["people", "feedback"], suggestedAction: "Prompt managers to log structured feedback this week.",
    kind: "lt", metricKey: "feedback_events_30d", threshold: 2,
  },
  {
    id: "P06", name: "Key person single-point dependency", domain: "people", severity: 4,
    description: "A critical knowledge domain has a bus factor of one.",
    tags: ["people", "key-person-risk"], suggestedAction: "Start a documented knowledge-transfer pairing.",
    kind: "lt", metricKey: "bus_factor_min", threshold: 2,
  },
  {
    id: "P07", name: "Team size optimal ratio breach", domain: "people", severity: 2,
    description: "Team size has drifted away from the organization's optimal staffing ratio.",
    tags: ["people", "org-design"], suggestedAction: "Review headcount plan against the target ratio.",
    kind: "gt", metricKey: "team_size_ratio_deviation", threshold: 0.3,
  },
  {
    id: "P08", name: "Span of control too wide", domain: "people", severity: 3,
    description: "A manager has more direct reports than recommended for effective coaching.",
    tags: ["people", "org-design", "manager"], suggestedAction: "Consider adding a team lead layer.",
    kind: "gt", metricKey: "span_of_control", threshold: 8,
  },
  {
    id: "P09", name: "Manager-to-IC ratio imbalanced", domain: "people", severity: 2,
    description: "The manager-to-individual-contributor ratio is outside a healthy band.",
    tags: ["people", "org-design"], suggestedAction: "Rebalance management layers in next org review.",
    kind: "gt", metricKey: "manager_to_ic_ratio", threshold: 0.25,
  },
  {
    id: "P10", name: "Burnout compound signal", domain: "people", severity: 5,
    description: "High average workload sustained alongside low mood is a compound burnout signal.",
    tags: ["people", "burnout", "composite"], suggestedAction: "Mandate a load-relief sprint for the affected team.",
    kind: "custom",
    autoThresholds: { loadThreshold: 7, moodThreshold: 5 },
    dataRefs: {
      metrics: [
        { key: "avg_load_30d", thresholdKey: "loadThreshold", direction: "gt" },
        { key: "avg_mood_30d", thresholdKey: "moodThreshold", direction: "lt" },
      ],
      events: [],
    },
    evaluate: (ctx, th) => {
      const load = metric(ctx, "avg_load_30d");
      const mood = metric(ctx, "avg_mood_30d");
      return load !== undefined && mood !== undefined && load > th.loadThreshold && mood < th.moodThreshold;
    },
    evidence: (ctx, th) => {
      const load = metric(ctx, "avg_load_30d");
      const mood = metric(ctx, "avg_mood_30d");
      return `load ${load?.toFixed(1) ?? "n/a"} (> ${th.loadThreshold}) & mood ${mood?.toFixed(1) ?? "n/a"} (< ${th.moodThreshold})`;
    },
  },
  {
    id: "P11", name: "Behavioral change point", domain: "people", severity: 3,
    description: "A statistically significant change point was detected in behavioral signals.",
    tags: ["people", "anomaly"], suggestedAction: "Check in informally before the next scheduled 1:1.",
    kind: "gt", metricKey: "behavior_change_score", threshold: 0.7,
  },
  {
    id: "P12", name: "Engagement outlier", domain: "people", severity: 2,
    description: "Variance in engagement scores across the team is unusually high.",
    tags: ["people", "engagement"], suggestedAction: "Identify and support the outlier individual(s).",
    kind: "gt", metricKey: "engagement_stddev", threshold: 2.5,
  },
  {
    id: "P13", name: "Conflict signal", domain: "people", severity: 3,
    description: "Multiple interpersonal conflicts have been opened recently.",
    tags: ["people", "conflict"], suggestedAction: "Facilitate a mediated conversation.",
    kind: "countInWindowGte", eventType: "conflict_opened", windowDays: 30, threshold: 2,
  },
  {
    id: "P14", name: "Growth plan stalled", domain: "people", severity: 2,
    description: "A growth plan has gone without a check-in for too long.",
    tags: ["people", "growth"], suggestedAction: "Book a growth-plan check-in this week.",
    kind: "daysSinceGt", eventType: "growth_plan_checkin", threshold: 45,
  },
  {
    id: "P15", name: "Skills gap critical", domain: "people", severity: 4,
    description: "A critical skills gap score has crossed the danger threshold.",
    tags: ["people", "skills"], suggestedAction: "Fund targeted upskilling or contract support.",
    kind: "gt", metricKey: "skills_gap_score", threshold: 0.7,
  },
  {
    id: "P16", name: "Succession gap", domain: "people", severity: 4,
    description: "Succession coverage for a critical role has fallen below a safe level.",
    tags: ["people", "succession"], suggestedAction: "Identify and sponsor a successor candidate.",
    kind: "lt", metricKey: "succession_coverage_pct", threshold: 50,
  },
  {
    id: "P17", name: "Onboarding overdue", domain: "people", severity: 2,
    description: "An onboarding plan has been open far longer than expected.",
    tags: ["people", "onboarding"], suggestedAction: "Escalate blockers in the onboarding checklist.",
    kind: "gt", metricKey: "onboarding_days_open", threshold: 45,
  },
  {
    id: "P18", name: "Offboarding risk", domain: "people", severity: 3,
    description: "An offboarding in progress carries elevated knowledge-loss or access risk.",
    tags: ["people", "offboarding", "risk"], suggestedAction: "Confirm knowledge transfer and access revocation checklist.",
    kind: "gt", metricKey: "offboarding_risk_score", threshold: 0.6,
  },
  {
    id: "P19", name: "Peer conflict detected", domain: "people", severity: 3,
    description: "Peer-level conflict events have been logged recently.",
    tags: ["people", "conflict", "peer"], suggestedAction: "Offer conflict-resolution coaching to both parties.",
    kind: "countInWindowGte", eventType: "peer_conflict", windowDays: 60, threshold: 1,
  },
  {
    id: "P20", name: "Team energy imbalance", domain: "people", severity: 2,
    description: "Variance in team energy/load distribution is unusually wide.",
    tags: ["people", "balance"], suggestedAction: "Rebalance work distribution across the team.",
    kind: "gt", metricKey: "team_energy_variance", threshold: 3,
  },
];

// ════════════════════════════ FINANCE (15) ════════════════════════════

const financeSpecs: RuleSpec[] = [
  {
    id: "F01", name: "Runway < 6 months", domain: "finance", severity: 4,
    description: "Cash runway at current burn has fallen under six months.",
    tags: ["finance", "runway"], suggestedAction: "Model a 3-scenario burn plan for the board.",
    kind: "lt", metricKey: "runway_months", threshold: 6,
  },
  {
    id: "F02", name: "Runway < 3 months (critical)", domain: "finance", severity: 5,
    description: "Cash runway has fallen under three months — immediate action required.",
    tags: ["finance", "runway", "critical"], suggestedAction: "Convene emergency leadership session on fundraising/cuts.",
    kind: "lt", metricKey: "runway_months", threshold: 3,
  },
  {
    id: "F03", name: "Burn rate accelerating", domain: "finance", severity: 4,
    description: "Month-over-month burn rate has accelerated sharply.",
    tags: ["finance", "burn"], suggestedAction: "Freeze discretionary spend pending review.",
    kind: "gt", metricKey: "burn_rate_delta_pct", threshold: 20,
  },
  {
    id: "F04", name: "LTV/CAC < 3", domain: "finance", severity: 3,
    description: "Lifetime value to customer acquisition cost ratio is below the healthy 3x benchmark.",
    tags: ["finance", "unit-economics"], suggestedAction: "Audit acquisition channels for efficiency.",
    kind: "lt", metricKey: "ltv_cac", threshold: 3,
  },
  {
    id: "F05", name: "Churn rate elevated", domain: "finance", severity: 4,
    description: "Customer churn rate has risen above the acceptable band.",
    tags: ["finance", "churn"], suggestedAction: "Launch a save-desk motion for at-risk accounts.",
    kind: "gt", metricKey: "churn_rate_pct", threshold: 5,
  },
  {
    id: "F06", name: "Gross margin deteriorating", domain: "finance", severity: 4,
    description: "Gross margin trend has moved meaningfully negative.",
    tags: ["finance", "margin"], suggestedAction: "Review COGS drivers and pricing.",
    kind: "lt", metricKey: "gross_margin_trend_pct", threshold: -5,
  },
  {
    id: "F07", name: "Revenue concentration risk", domain: "finance", severity: 4,
    description: "Top customer represents over 30% of revenue.",
    tags: ["finance", "concentration"], suggestedAction: "Diversify pipeline away from the top account.",
    kind: "gt", metricKey: "top_customer_revenue_pct", threshold: 30,
  },
  {
    id: "F08", name: "Pipeline coverage < 2.5x", domain: "finance", severity: 3,
    description: "Sales pipeline coverage has fallen below 2.5x the quarterly target.",
    tags: ["finance", "pipeline"], suggestedAction: "Accelerate top-of-funnel generation.",
    kind: "lt", metricKey: "pipeline_coverage_x", threshold: 2.5,
  },
  {
    id: "F09", name: "Cash conversion cycle widening", domain: "finance", severity: 3,
    description: "Cash conversion cycle has lengthened beyond target days.",
    tags: ["finance", "working-capital"], suggestedAction: "Tighten collections and renegotiate vendor terms.",
    kind: "gt", metricKey: "cash_conversion_days", threshold: 60,
  },
  {
    id: "F10", name: "Payroll % of revenue rising", domain: "finance", severity: 3,
    description: "Payroll as a share of revenue has risen above the sustainable threshold.",
    tags: ["finance", "payroll"], suggestedAction: "Review hiring plan against revenue trajectory.",
    kind: "gt", metricKey: "payroll_pct_revenue", threshold: 55,
  },
  {
    id: "F11", name: "Unplanned spend > budget", domain: "finance", severity: 3,
    description: "Unplanned spend has exceeded the budget variance tolerance.",
    tags: ["finance", "budget"], suggestedAction: "Require VP sign-off on further unbudgeted spend.",
    kind: "gt", metricKey: "unplanned_spend_pct", threshold: 10,
  },
  {
    id: "F12", name: "AP aging", domain: "finance", severity: 2,
    description: "Accounts payable aging has stretched beyond target terms.",
    tags: ["finance", "ap"], suggestedAction: "Prioritize payment runs for aging vendor invoices.",
    kind: "gt", metricKey: "ap_aging_days", threshold: 45,
  },
  {
    id: "F13", name: "AR aging", domain: "finance", severity: 3,
    description: "Accounts receivable aging has stretched beyond target terms.",
    tags: ["finance", "ar"], suggestedAction: "Escalate overdue invoices to collections.",
    kind: "gt", metricKey: "ar_aging_days", threshold: 60,
  },
  {
    id: "F14", name: "Unit economics declining", domain: "finance", severity: 4,
    description: "The composite unit economics index has fallen below breakeven.",
    tags: ["finance", "unit-economics"], suggestedAction: "Reassess pricing and packaging model.",
    kind: "lt", metricKey: "unit_economics_index", threshold: 1,
  },
  {
    id: "F15", name: "R&D spend efficiency dropping", domain: "finance", severity: 2,
    description: "R&D output per dollar spent is trending down.",
    tags: ["finance", "rd"], suggestedAction: "Review roadmap prioritization against spend.",
    kind: "lt", metricKey: "rd_efficiency_index", threshold: 0.8,
  },
];

// ════════════════════════════ SALES (15) ════════════════════════════

const salesSpecs: RuleSpec[] = [
  {
    id: "S01", name: "Pipeline thin", domain: "sales", severity: 3,
    description: "Open pipeline value relative to quota is thin.",
    tags: ["sales", "pipeline"], suggestedAction: "Run a pipeline-generation sprint.",
    kind: "lt", metricKey: "pipeline_value_ratio", threshold: 3,
  },
  {
    id: "S02", name: "Win rate declining", domain: "sales", severity: 4,
    description: "Win rate has dropped meaningfully versus trailing average.",
    tags: ["sales", "win-rate"], suggestedAction: "Audit lost deals for a common root cause.",
    kind: "lt", metricKey: "win_rate_delta_pct", threshold: -10,
  },
  {
    id: "S03", name: "Deal velocity slowing", domain: "sales", severity: 3,
    description: "Average deal cycle time has slowed versus baseline.",
    tags: ["sales", "velocity"], suggestedAction: "Review stage-by-stage conversion for bottlenecks.",
    kind: "gt", metricKey: "deal_velocity_days_delta", threshold: 15,
  },
  {
    id: "S04", name: "Average deal size shrinking", domain: "sales", severity: 3,
    description: "Average deal size has shrunk versus trailing baseline.",
    tags: ["sales", "deal-size"], suggestedAction: "Review ICP targeting and upsell motion.",
    kind: "lt", metricKey: "avg_deal_size_delta_pct", threshold: -15,
  },
  {
    id: "S05", name: "Forecast accuracy low", domain: "sales", severity: 3,
    description: "Forecast-to-actual accuracy has dropped below an acceptable band.",
    tags: ["sales", "forecast"], suggestedAction: "Recalibrate forecast methodology with RevOps.",
    kind: "lt", metricKey: "forecast_accuracy_pct", threshold: 70,
  },
  {
    id: "S06", name: "Quota attainment < 80%", domain: "sales", severity: 4,
    description: "Team-wide quota attainment has fallen below 80%.",
    tags: ["sales", "quota"], suggestedAction: "Review coverage model and coaching cadence.",
    kind: "lt", metricKey: "quota_attainment_pct", threshold: 80,
  },
  {
    id: "S07", name: "Top rep dependency", domain: "sales", severity: 3,
    description: "A single rep accounts for a disproportionate share of revenue.",
    tags: ["sales", "key-person-risk"], suggestedAction: "Cross-train backup coverage for key accounts.",
    kind: "gt", metricKey: "top_rep_revenue_share_pct", threshold: 40,
  },
  {
    id: "S08", name: "New logo acquisition stalling", domain: "sales", severity: 3,
    description: "New logo count in the last 30 days has dropped below target.",
    tags: ["sales", "new-logo"], suggestedAction: "Re-energize outbound and partner-sourced pipeline.",
    kind: "lt", metricKey: "new_logo_count_30d", threshold: 3,
  },
  {
    id: "S09", name: "Expansion revenue flat", domain: "sales", severity: 2,
    description: "Expansion/upsell revenue growth has flattened.",
    tags: ["sales", "expansion"], suggestedAction: "Launch a structured account-expansion play.",
    kind: "lt", metricKey: "expansion_revenue_growth_pct", threshold: 2,
  },
  {
    id: "S10", name: "Competitive loss pattern", domain: "sales", severity: 4,
    description: "Multiple deals have been lost to the same competitor recently.",
    tags: ["sales", "competitive"], suggestedAction: "Build a battlecard refresh and win-back plan.",
    kind: "countInWindowGte", eventType: "deal_lost_competitive", windowDays: 60, threshold: 3,
  },
  {
    id: "S11", name: "Sales cycle lengthening", domain: "sales", severity: 2,
    description: "Sales cycle length has increased versus baseline.",
    tags: ["sales", "cycle"], suggestedAction: "Identify and remove approval bottlenecks.",
    kind: "gt", metricKey: "sales_cycle_days_delta", threshold: 10,
  },
  {
    id: "S12", name: "Channel mix imbalanced", domain: "sales", severity: 2,
    description: "Revenue is overly concentrated in a single go-to-market channel.",
    tags: ["sales", "channel"], suggestedAction: "Invest in a second growth channel.",
    kind: "gt", metricKey: "channel_concentration_pct", threshold: 70,
  },
  {
    id: "S13", name: "Customer concentration (sales)", domain: "sales", severity: 3,
    description: "A single customer represents a large share of bookings.",
    tags: ["sales", "concentration"], suggestedAction: "Diversify the bookings base across more accounts.",
    kind: "gt", metricKey: "top_customer_pct_bookings", threshold: 25,
  },
  {
    id: "S14", name: "NPS declining", domain: "sales", severity: 3,
    description: "Net Promoter Score has dropped versus the prior period.",
    tags: ["sales", "nps"], suggestedAction: "Launch a customer-voice listening tour.",
    kind: "lt", metricKey: "nps_delta", threshold: -10,
  },
  {
    id: "S15", name: "Support ticket volume rising", domain: "sales", severity: 3,
    description: "Support ticket volume has grown sharply, often a leading churn indicator.",
    tags: ["sales", "support"], suggestedAction: "Triage top ticket categories with product/CS.",
    kind: "gt", metricKey: "support_ticket_growth_pct", threshold: 25,
  },
];

// ════════════════════════════ OPS (15) ════════════════════════════

const opsSpecs: RuleSpec[] = [
  {
    id: "O01", name: "Incident frequency rising", domain: "ops", severity: 4,
    description: "Incident count has grown sharply month over month.",
    tags: ["ops", "incidents"], suggestedAction: "Run a blameless retro across recent incidents.",
    kind: "gt", metricKey: "incident_count_30d_delta_pct", threshold: 20,
  },
  {
    id: "O02", name: "Mean time to resolve > threshold", domain: "ops", severity: 3,
    description: "Average incident resolution time exceeds the target SLA.",
    tags: ["ops", "mttr"], suggestedAction: "Invest in on-call tooling and runbooks.",
    kind: "gt", metricKey: "mttr_hours", threshold: 4,
  },
  {
    id: "O03", name: "Deployment frequency declining", domain: "ops", severity: 3,
    description: "Deployment frequency has dropped versus baseline.",
    tags: ["ops", "devex"], suggestedAction: "Investigate CI/CD pipeline friction.",
    kind: "lt", metricKey: "deploy_freq_delta_pct", threshold: -20,
  },
  {
    id: "O04", name: "Change failure rate rising", domain: "ops", severity: 4,
    description: "The share of changes causing failures has increased.",
    tags: ["ops", "quality"], suggestedAction: "Tighten pre-merge testing and review gates.",
    kind: "gt", metricKey: "change_failure_rate_pct", threshold: 15,
  },
  {
    id: "O05", name: "Lead time for changes increasing", domain: "ops", severity: 2,
    description: "Lead time from commit to production has lengthened.",
    tags: ["ops", "devex"], suggestedAction: "Reduce batch size and review latency.",
    kind: "gt", metricKey: "lead_time_days_delta", threshold: 2,
  },
  {
    id: "O06", name: "On-call burden concentrated", domain: "ops", severity: 3,
    description: "On-call load is concentrated on a small number of engineers (high Gini).",
    tags: ["ops", "on-call", "key-person-risk"], suggestedAction: "Rebalance the on-call rotation.",
    kind: "gt", metricKey: "oncall_gini_coefficient", threshold: 0.6,
  },
  {
    id: "O07", name: "Tech debt signal", domain: "ops", severity: 3,
    description: "The composite tech-debt index has crossed a concerning threshold.",
    tags: ["ops", "tech-debt"], suggestedAction: "Allocate a fixed % of sprint capacity to debt paydown.",
    kind: "gt", metricKey: "tech_debt_index", threshold: 70,
  },
  {
    id: "O08", name: "Capacity utilization > 85%", domain: "ops", severity: 3,
    description: "Team or infrastructure capacity utilization exceeds a safe threshold.",
    tags: ["ops", "capacity"], suggestedAction: "Plan capacity headroom for the next quarter.",
    kind: "gt", metricKey: "capacity_utilization_pct", threshold: 85,
  },
  {
    id: "O09", name: "SLA breach risk", domain: "ops", severity: 4,
    description: "Projected SLA breach rate has crossed a risk threshold.",
    tags: ["ops", "sla"], suggestedAction: "Notify affected customers proactively and remediate.",
    kind: "gt", metricKey: "sla_breach_risk_pct", threshold: 10,
  },
  {
    id: "O10", name: "Dependency risk (vendor/service)", domain: "ops", severity: 3,
    description: "A critical vendor/service dependency carries elevated risk.",
    tags: ["ops", "vendor"], suggestedAction: "Identify a fallback vendor or contingency plan.",
    kind: "gt", metricKey: "vendor_risk_score", threshold: 0.6,
  },
  {
    id: "O11", name: "Security incident signal", domain: "ops", severity: 5,
    description: "A security incident has been logged recently.",
    tags: ["ops", "security"], suggestedAction: "Trigger the incident response playbook immediately.",
    kind: "countInWindowGte", eventType: "security_incident", windowDays: 90, threshold: 1,
  },
  {
    id: "O12", name: "Compliance gap", domain: "ops", severity: 3,
    description: "A compliance review is overdue.",
    tags: ["ops", "compliance"], suggestedAction: "Schedule the overdue compliance review.",
    kind: "daysSinceGt", eventType: "compliance_review", threshold: 120,
  },
  {
    id: "O13", name: "Process documentation lag", domain: "ops", severity: 2,
    description: "Documentation coverage for critical processes is too low.",
    tags: ["ops", "documentation"], suggestedAction: "Prioritize a documentation sprint.",
    kind: "lt", metricKey: "doc_coverage_pct", threshold: 60,
  },
  {
    id: "O14", name: "Tooling adoption low", domain: "ops", severity: 2,
    description: "Adoption of a key operational tool is below target.",
    tags: ["ops", "tooling"], suggestedAction: "Run an enablement session for the underused tool.",
    kind: "lt", metricKey: "tooling_adoption_pct", threshold: 50,
  },
  {
    id: "O15", name: "Operational efficiency declining", domain: "ops", severity: 3,
    description: "The composite operational efficiency index is trending down.",
    tags: ["ops", "efficiency"], suggestedAction: "Audit workflow bottlenecks in the ops review.",
    kind: "lt", metricKey: "ops_efficiency_index_delta", threshold: -10,
  },
];

// ════════════════════════════ STRATEGY (15) ════════════════════════════

const strategySpecs: RuleSpec[] = [
  {
    id: "ST01", name: "OKR velocity low", domain: "strategy", severity: 3,
    description: "OKR completion velocity has fallen below a healthy pace.",
    tags: ["strategy", "okr"], suggestedAction: "Re-scope OKRs to fit realistic capacity.",
    kind: "lt", metricKey: "okr_completion_velocity_pct", threshold: 50,
  },
  {
    id: "ST02", name: "Initiative backlog growing", domain: "strategy", severity: 2,
    description: "The strategic initiative backlog is growing faster than it's shrinking.",
    tags: ["strategy", "backlog"], suggestedAction: "Hold a prioritization and pruning session.",
    kind: "gt", metricKey: "initiative_backlog_growth_pct", threshold: 20,
  },
  {
    id: "ST03", name: "Strategy-execution gap", domain: "strategy", severity: 4,
    description: "A composite score shows a widening gap between stated strategy and execution.",
    tags: ["strategy", "execution"], suggestedAction: "Reconcile roadmap against stated strategic bets.",
    kind: "gt", metricKey: "strategy_execution_gap_score", threshold: 0.5,
  },
  {
    id: "ST04", name: "Market signal ignored", domain: "strategy", severity: 3,
    description: "A notable market signal has gone unanswered for too long.",
    tags: ["strategy", "market"], suggestedAction: "Assign an owner to respond to the market signal.",
    kind: "daysSinceGt", eventType: "market_signal_response", threshold: 30,
  },
  {
    id: "ST05", name: "Competitive positioning eroding", domain: "strategy", severity: 4,
    description: "Competitive position index has trended down meaningfully.",
    tags: ["strategy", "competitive"], suggestedAction: "Refresh competitive positioning and messaging.",
    kind: "lt", metricKey: "competitive_position_index_delta", threshold: -10,
  },
  {
    id: "ST06", name: "Innovation portfolio unbalanced", domain: "strategy", severity: 2,
    description: "The innovation portfolio is skewed too heavily toward one horizon.",
    tags: ["strategy", "innovation"], suggestedAction: "Rebalance the 3-horizon innovation portfolio.",
    kind: "gt", metricKey: "innovation_portfolio_skew", threshold: 0.7,
  },
  {
    id: "ST07", name: "Scenario planning stale", domain: "strategy", severity: 2,
    description: "Scenario plans have not been refreshed recently.",
    tags: ["strategy", "planning"], suggestedAction: "Refresh scenario plans against current conditions.",
    kind: "daysSinceGt", eventType: "scenario_plan_update", threshold: 180,
  },
  {
    id: "ST08", name: "Stakeholder alignment gap", domain: "strategy", severity: 3,
    description: "Stakeholder alignment score has fallen below a healthy level.",
    tags: ["strategy", "alignment"], suggestedAction: "Run a stakeholder alignment workshop.",
    kind: "lt", metricKey: "stakeholder_alignment_score", threshold: 60,
  },
  {
    id: "ST09", name: "Narrative inconsistency", domain: "strategy", severity: 3,
    description: "The external/internal narrative consistency score is low.",
    tags: ["strategy", "narrative"], suggestedAction: "Align leadership on one narrative before next comms.",
    kind: "lt", metricKey: "narrative_consistency_score", threshold: 60,
  },
  {
    id: "ST10", name: "Talent strategy misaligned with org goals", domain: "strategy", severity: 3,
    description: "Talent strategy alignment score with stated org goals is low.",
    tags: ["strategy", "talent"], suggestedAction: "Re-align hiring plan with strategic priorities.",
    kind: "lt", metricKey: "talent_strategy_alignment_score", threshold: 60,
  },
  {
    id: "ST11", name: "Partnership pipeline thin", domain: "strategy", severity: 2,
    description: "Strategic partnership pipeline has fallen below target count.",
    tags: ["strategy", "partnerships"], suggestedAction: "Re-energize BD outreach for partnerships.",
    kind: "lt", metricKey: "partnership_pipeline_count", threshold: 3,
  },
  {
    id: "ST12", name: "Regulatory exposure", domain: "strategy", severity: 4,
    description: "Regulatory exposure score has crossed a risk threshold.",
    tags: ["strategy", "regulatory"], suggestedAction: "Engage legal/compliance to assess exposure.",
    kind: "gt", metricKey: "regulatory_exposure_score", threshold: 0.6,
  },
  {
    id: "ST13", name: "Geographic concentration risk", domain: "strategy", severity: 3,
    description: "Revenue or operations are overly concentrated in one geography.",
    tags: ["strategy", "concentration"], suggestedAction: "Evaluate geographic diversification options.",
    kind: "gt", metricKey: "geo_concentration_pct", threshold: 60,
  },
  {
    id: "ST14", name: "Customer segment evolution missed", domain: "strategy", severity: 2,
    description: "Customer segment review is overdue, risking missed shifts in ICP.",
    tags: ["strategy", "segments"], suggestedAction: "Run a refreshed segmentation analysis.",
    kind: "daysSinceGt", eventType: "segment_review", threshold: 150,
  },
  {
    id: "ST15", name: "Board alignment gap", domain: "strategy", severity: 3,
    description: "Board alignment score has fallen below a healthy level.",
    tags: ["strategy", "board"], suggestedAction: "Pre-wire key decisions with board members individually.",
    kind: "lt", metricKey: "board_alignment_score", threshold: 60,
  },
];

const ALL_SPECS: RuleSpec[] = [...peopleSpecs, ...financeSpecs, ...salesSpecs, ...opsSpecs, ...strategySpecs];

/** The canonical, dynamic rule catalog (80 built-in rules). Treat as a template —
 * the live app works off cloned instances held in `ruleStore`, since rules mutate. */
export const RULE_CATALOG: Rule[] = ALL_SPECS.map(compile);

export function cloneRule(rule: Rule): Rule {
  return {
    ...rule,
    calibration: { ...rule.calibration, lastCalibrated: new Date(rule.calibration.lastCalibrated) },
    autoThresholds: { ...rule.autoThresholds },
    tags: [...rule.tags],
    dataRefs: {
      metrics: rule.dataRefs.metrics.map((m) => ({ ...m })),
      events: rule.dataRefs.events.map((e) => ({ ...e })),
    },
  };
}

export const DOMAINS: Domain[] = ["people", "finance", "sales", "ops", "strategy"];

export const DOMAIN_COLORS: Record<Domain, string> = {
  people: "#8b5cf6",
  finance: "#10b981",
  sales: "#3b82f6",
  ops: "#f59e0b",
  strategy: "#ec4899",
};
