// =============================================================================
// Part 32 — synthetic domain read-models.
// =============================================================================
// SEAM NOTICE: in the real repo these six domains are served by Part 07
// (strategy), Part 08 (`financeEngine.ts`/`kpis.ts`/`financialStory.ts`),
// Part 09 (people), Part 29 (risk/controls), execution APIs (operations) and
// Part 27 (market). This sandbox has no database, so `domainData.ts` is a
// deterministic, hand-authored stand-in that mirrors their *shapes* exactly
// (same field names as `narrativeIntel.ts`'s `MetricDelta`/`RecentEvent`
// where applicable) so `answerCompilers.ts` and `briefingCompiler.ts` are
// drop-in once wired to the real queries. No `Math.random()` is used for
// numbers that get cited — everything here is a fixed fixture, which is what
// makes the citation-lint and numbers-freeze tests reproducible.
import type { ConfidenceClass, Domain } from "./types";

export interface OrgDataset {
  id: string;
  label: string;
  asOf: string; // ISO date the snapshot represents
  strategy: StrategyData;
  finance: FinanceData;
  people: PeopleData;
  risk: RiskData;
  operations: OperationsData;
  market: MarketData;
  decisionLog: DecisionLogEntry[];
  approvalsInbox: ApprovalItem[];
  auditLog: AuditEntry[];
}

export interface Objective {
  id: string;
  title: string;
  ownerName: string;
  progressPct: number;
  targetPct: number;
  confidence: ConfidenceClass;
  trendDeltaPct: number | null;
  status: "on_track" | "at_risk" | "off_track";
}

export interface StrategyData {
  quarterLabel: string;
  objectives: Objective[];
  competitivePositionDeltaPts: number | null; // null => not tracked
}

export interface FinanceData {
  month: string;
  revenueActual: number;
  revenuePlan: number;
  revenueConfidence: ConfidenceClass;
  grossMarginPct: number;
  grossMarginDeltaPts: number;
  cashBalance: number;
  runwayMonths: number;
  forecastNextMonth: { p10: number; p50: number; p90: number } | null;
}

export interface PeopleData {
  headcount: number;
  attritionRate12moPct: number;
  attritionDeltaPts: number;
  highRiskTeams: { teamName: string; attritionRiskScore: number; headcount: number }[];
  engagementScore: number | null; // null => no recent survey, not answerable
  engagementDeltaPts: number | null;
  openRolesVsPlan: number;
}

export interface RiskItem {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  indicatorValue: number;
  thresholdValue: number;
  proximityPct: number; // 0-100, how close to breaching threshold
  owner: string;
  domain: Domain;
}

export interface ControlTest {
  id: string;
  controlName: string;
  result: "passed" | "failed";
  lastRunDate: string;
}

export interface RiskData {
  items: RiskItem[];
  controlTests: ControlTest[];
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  status: "on_track" | "at_risk" | "late";
  daysLate: number;
}

export interface OperationsData {
  milestones: Milestone[];
  cycleTimeDaysActual: number;
  cycleTimeDaysPlan: number;
}

export interface CompetitorSignal {
  competitorName: string;
  signal: string;
  deltaPts: number | null;
}

export interface MarketData {
  shareOfVoicePct: number | null;
  shareOfVoiceDeltaPts: number | null;
  sentimentScore: number | null; // -100..100, null => not tracked yet
  sentimentDeltaPts: number | null;
  competitorSignals: CompetitorSignal[];
}

export interface DecisionLogEntry {
  id: string;
  title: string;
  decidedAt: string;
  decidedBy: string;
  rationale: string;
  reversible: boolean;
}

export interface ApprovalItem {
  id: string;
  title: string;
  requestedBy: string;
  riskClass: "low" | "medium" | "high";
  domain: Domain;
  dueDate: string;
}

export interface AuditEntry {
  id: string;
  summary: string;
  occurredAt: string;
  domain: Domain;
}

// ---------------------------------------------------------------------------
// Scenario 1: "northwind" — a real org with a full trailing history. This is
// what Phase 4's gates are measured against.
// ---------------------------------------------------------------------------
export const NORTHWIND: OrgDataset = {
  id: "northwind",
  label: "Northwind (sample org)",
  asOf: "2026-03-09",
  strategy: {
    quarterLabel: "Q1 2026",
    objectives: [
      { id: "obj-1", title: "Expand enterprise ARR", ownerName: "Dana Reyes", progressPct: 61, targetPct: 75, confidence: "evidence", trendDeltaPct: 4, status: "at_risk" },
      { id: "obj-2", title: "Ship platform v3", ownerName: "Marcus Lee", progressPct: 88, targetPct: 80, confidence: "actual", trendDeltaPct: 6, status: "on_track" },
      { id: "obj-3", title: "Reduce churn to 4%", ownerName: "Priya Nair", progressPct: 32, targetPct: 70, confidence: "evidence", trendDeltaPct: -3, status: "off_track" },
    ],
    competitivePositionDeltaPts: 2.4,
  },
  finance: {
    month: "Feb 2026",
    revenueActual: 1842000,
    revenuePlan: 1910000,
    revenueConfidence: "actual",
    grossMarginPct: 71.2,
    grossMarginDeltaPts: -1.4,
    cashBalance: 6420000,
    runwayMonths: 14.6,
    forecastNextMonth: { p10: 1790000, p50: 1930000, p90: 2065000 },
  },
  people: {
    headcount: 214,
    attritionRate12moPct: 12.8,
    attritionDeltaPts: 1.9,
    highRiskTeams: [
      { teamName: "Customer Success", attritionRiskScore: 71, headcount: 24 },
      { teamName: "Platform Engineering", attritionRiskScore: 54, headcount: 38 },
    ],
    engagementScore: 73,
    engagementDeltaPts: -2,
    openRolesVsPlan: -5,
  },
  risk: {
    items: [
      { id: "risk-1", title: "Customer concentration (top 3 accounts)", severity: "high", indicatorValue: 34, thresholdValue: 35, proximityPct: 97, owner: "Dana Reyes", domain: "finance" },
      { id: "risk-2", title: "Checkout latency degradation", severity: "medium", indicatorValue: 980, thresholdValue: 1000, proximityPct: 91, owner: "Marcus Lee", domain: "operations" },
      { id: "risk-3", title: "Key-person dependency, Platform Eng", severity: "medium", indicatorValue: 1, thresholdValue: 1, proximityPct: 100, owner: "Marcus Lee", domain: "people" },
    ],
    controlTests: [
      { id: "ctl-1", controlName: "SOC2 access review", result: "passed", lastRunDate: "2026-03-01" },
      { id: "ctl-2", controlName: "Vendor DPA renewal sweep", result: "failed", lastRunDate: "2026-03-05" },
    ],
  },
  operations: {
    milestones: [
      { id: "ms-1", title: "Platform v3 GA", dueDate: "2026-03-20", status: "on_track", daysLate: 0 },
      { id: "ms-2", title: "SOC2 Type II renewal", dueDate: "2026-03-15", status: "at_risk", daysLate: 0 },
      { id: "ms-3", title: "EU data residency rollout", dueDate: "2026-02-28", status: "late", daysLate: 9 },
    ],
    cycleTimeDaysActual: 6.4,
    cycleTimeDaysPlan: 5.0,
  },
  market: {
    shareOfVoicePct: 18.3,
    shareOfVoiceDeltaPts: 1.1,
    sentimentScore: 42,
    sentimentDeltaPts: -5,
    competitorSignals: [
      { competitorName: "Vantage Rail", signal: "Launched a competing automation tier", deltaPts: -2.0 },
      { competitorName: "Clearpath", signal: "Lost a marquee logo to churn", deltaPts: 1.3 },
    ],
  },
  decisionLog: [
    { id: "dec-1", title: "Delay EU data residency rollout 2 weeks", decidedAt: "2026-03-07", decidedBy: "Marcus Lee", rationale: "Infra migration risk outweighed date; 9 days late is recoverable without a customer-visible breach.", reversible: true },
    { id: "dec-2", title: "Approve $180,000 CS headcount addition", decidedAt: "2026-03-04", decidedBy: "Dana Reyes", rationale: "Attrition risk score of 71 in Customer Success exceeded the 65 action threshold two cycles running.", reversible: false },
  ],
  approvalsInbox: [
    { id: "ap-1", title: "Vendor DPA renewal — Acme Processing", requestedBy: "Legal Ops", riskClass: "medium", domain: "risk", dueDate: "2026-03-11" },
    { id: "ap-2", title: "Churn-save discount >15% for Globex Corp", requestedBy: "Priya Nair", riskClass: "high", domain: "finance", dueDate: "2026-03-10" },
    { id: "ap-3", title: "Platform v3 GA go/no-go", requestedBy: "Marcus Lee", riskClass: "low", domain: "operations", dueDate: "2026-03-12" },
  ],
  auditLog: [
    { id: "aud-1", summary: "Revenue actual for Feb 2026 posted: $1,842,000 (plan $1,910,000).", occurredAt: "2026-03-08T07:00:00Z", domain: "finance" },
    { id: "aud-2", summary: "Checkout latency alert fired: 980ms observed vs 1000ms threshold (91% proximity).", occurredAt: "2026-03-08T04:12:00Z", domain: "operations" },
    { id: "aud-3", summary: "Vendor DPA renewal control test FAILED for Acme Processing.", occurredAt: "2026-03-05T09:30:00Z", domain: "risk" },
    { id: "aud-4", summary: "Decision recorded: delay EU data residency rollout 2 weeks.", occurredAt: "2026-03-07T15:02:00Z", domain: "strategy" },
    { id: "aud-5", summary: "Customer Success attrition risk score rose to 71 (+6 vs last cycle).", occurredAt: "2026-03-06T11:00:00Z", domain: "people" },
  ],
};

// ---------------------------------------------------------------------------
// Scenario 2: "fledgling" — an org with almost no data yet (Phase 5, Q3:
// "what does the pack look like for an org with almost no data"). Used by
// verify.ts's honest-emptiness test and selectable in the cockpit for a live
// demo of the same code path producing `NotAnswerableYet` states instead of
// fabricated confidence.
// ---------------------------------------------------------------------------
export const FLEDGLING: OrgDataset = {
  id: "fledgling",
  label: "Fledgling Co. (new workspace, 9 days old)",
  asOf: "2026-03-09",
  strategy: {
    quarterLabel: "Q1 2026",
    objectives: [
      { id: "obj-1", title: "Find product-market fit", ownerName: "Sam Osei", progressPct: 10, targetPct: 50, confidence: "asserted", trendDeltaPct: null, status: "at_risk" },
    ],
    competitivePositionDeltaPts: null,
  },
  finance: {
    month: "Mar 2026",
    revenueActual: 4200,
    revenuePlan: 4200,
    revenueConfidence: "asserted",
    grossMarginPct: 0,
    grossMarginDeltaPts: 0,
    cashBalance: 210000,
    runwayMonths: 11.2,
    forecastNextMonth: null,
  },
  people: {
    headcount: 3,
    attritionRate12moPct: 0,
    attritionDeltaPts: 0,
    highRiskTeams: [],
    engagementScore: null,
    engagementDeltaPts: null,
    openRolesVsPlan: 0,
  },
  risk: { items: [], controlTests: [] },
  operations: {
    milestones: [{ id: "ms-1", title: "Ship first paid pilot", dueDate: "2026-03-30", status: "on_track", daysLate: 0 }],
    cycleTimeDaysActual: 0,
    cycleTimeDaysPlan: 0,
  },
  market: { shareOfVoicePct: null, shareOfVoiceDeltaPts: null, sentimentScore: null, sentimentDeltaPts: null, competitorSignals: [] },
  decisionLog: [],
  approvalsInbox: [
    { id: "ap-1", title: "Approve first pilot contract terms", requestedBy: "Sam Osei", riskClass: "low", domain: "finance", dueDate: "2026-03-12" },
  ],
  auditLog: [{ id: "aud-1", summary: "Workspace created and first metric (cash balance) recorded.", occurredAt: "2026-03-01T00:00:00Z", domain: "finance" }],
};

export const ORG_DATASETS: Record<string, OrgDataset> = {
  northwind: NORTHWIND,
  fledgling: FLEDGLING,
};
