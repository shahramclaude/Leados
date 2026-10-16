// All data in this file is FABRICATED SAMPLE DATA for demonstration only.
// It imitates the shape of event-sourced LeadOS records (per the brief's
// "[source] · [confidence] · [label]" contract) but no real
// store.js/events.js/engine.js event log was read or ported this session —
// see AI-SESSION-LOG.md §0 for exactly what was and wasn't inspected in
// github.com/wbweve/Leados. Every dataset below states its (sample) source
// string so every chart in this app can show real-looking provenance text
// without pretending to be real.

import type {
  BulletMetric,
  CalibrationBucket,
  CohortRow,
  GanttItem,
  HeatCell,
  HistogramBucket,
  LineSeries,
  NetworkEdge,
  NetworkNode,
  RadarSeries,
  WaterfallItem,
} from "./types";

export const grossMarginSeries: LineSeries[] = [
  {
    label: "gross margin",
    color: "var(--domain-finance)",
    conf: "high",
    points: [
      { x: "2024-10-01", y: 71 },
      { x: "2025-01-01", y: 69 },
      { x: "2025-04-01", y: 67 },
      { x: "2025-07-01", y: 64 },
      { x: "2025-10-01", y: null },
      { x: "2026-01-01", y: 61 },
      { x: "2026-04-01", y: 59 },
      { x: "2026-07-01", y: 58 },
    ],
  },
];

export const npsSeries: LineSeries[] = [
  {
    label: "NPS",
    color: "var(--domain-customerSuccess)",
    conf: "medium",
    points: Array.from({ length: 12 }).map((_, i) => ({
      x: `2025-${String(i + 1).padStart(2, "0")}-01`,
      y: 28 + Math.round(Math.sin(i / 2) * 8 + i * 0.6),
    })),
  },
];

export const marginBullet: BulletMetric = {
  label: "Gross margin",
  actual: 58,
  target: 75,
  prior: 61,
  unit: "%",
  ranges: [
    { lo: 0, hi: 60, label: "poor", color: "var(--sev-5)" },
    { lo: 60, hi: 72, label: "satisfactory", color: "var(--sev-3)" },
    { lo: 72, hi: 100, label: "good", color: "var(--sev-1)" },
  ],
};

export const revenueBullet: BulletMetric = {
  label: "Revenue ($M, qtr)",
  actual: 4.2,
  target: 5.0,
  prior: 3.9,
  ranges: [
    { lo: 0, hi: 3.5, label: "poor", color: "var(--sev-5)" },
    { lo: 3.5, hi: 4.6, label: "satisfactory", color: "var(--sev-3)" },
    { lo: 4.6, hi: 6, label: "good", color: "var(--sev-1)" },
  ],
};

export const ebitdaBullet: BulletMetric = {
  label: "EBITDA margin",
  actual: 6,
  target: 15,
  prior: 4,
  unit: "%",
  ranges: [
    { lo: -10, hi: 0, label: "poor", color: "var(--sev-5)" },
    { lo: 0, hi: 12, label: "satisfactory", color: "var(--sev-3)" },
    { lo: 12, hi: 25, label: "good", color: "var(--sev-1)" },
  ],
};

export const spanLoadBullet: BulletMetric = {
  label: "Span of control (directs + skips)",
  actual: 11,
  target: 8,
  ranges: [
    { lo: 0, hi: 6, label: "light", color: "var(--sev-1)" },
    { lo: 6, hi: 9, label: "healthy", color: "var(--sev-2)" },
    { lo: 9, hi: 16, label: "overloaded", color: "var(--sev-5)" },
  ],
};

export const domainHeatmap: HeatCell[] = [
  { label: "finance", value: 6, maxValue: 10, color: "var(--domain-finance)" },
  { label: "people", value: 4, maxValue: 10, color: "var(--domain-people)" },
  { label: "sales", value: 7, maxValue: 10, color: "var(--domain-sales)" },
  { label: "product", value: 5, maxValue: 10, color: "var(--domain-product)" },
  { label: "engineering", value: 8, maxValue: 10, color: "var(--domain-engineering)" },
  { label: "operations", value: 3, maxValue: 10, color: "var(--domain-operations)" },
  { label: "marketing", value: 5, maxValue: 10, color: "var(--domain-marketing)" },
  { label: "manufacturing", value: 2, maxValue: 10, color: "var(--domain-manufacturing)" },
  { label: "design", value: 6, maxValue: 10, color: "var(--domain-design)" },
  { label: "rd", value: 4, maxValue: 10, color: "var(--domain-rd)" },
  { label: "legal", value: 7, maxValue: 10, color: "var(--domain-legal)" },
  { label: "custSuccess", value: 6, maxValue: 10, color: "var(--domain-customerSuccess)" },
  { label: "supplyChain", value: 3, maxValue: 10, color: "var(--domain-supplyChain)" },
  { label: "executive", value: 5, maxValue: 10, color: "var(--domain-executive)" },
];

export function genCalendarActivity(weeks = 52): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const weekday = d.getDay();
    // deterministic pseudo-random so the build is reproducible
    const seed = (i * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    const base = weekday === 0 || weekday === 6 ? 0.15 : 0.55;
    const count = rnd < base ? 0 : Math.round(rnd * 6);
    out.push({ date: d.toISOString().slice(0, 10), count });
  }
  return out;
}

export const findingSeverityHistogram: HistogramBucket[] = [
  { label: "sev 1", count: 8 },
  { label: "sev 2", count: 14 },
  { label: "sev 3", count: 11 },
  { label: "sev 4", count: 6 },
  { label: "sev 5", count: 2 },
];

export const plWaterfall: WaterfallItem[] = [
  { label: "Revenue", value: 4200, type: "base" },
  { label: "COGS", value: -1764, type: "subtract" },
  { label: "Gross profit", value: 2436, type: "total" },
  { label: "OPEX", value: -2184, type: "subtract" },
  { label: "EBITDA", value: 252, type: "total" },
];

export const radarAxes = [
  "vision",
  "execution",
  "communication",
  "trust",
  "growth",
  "decisions",
  "composure",
  "listening",
];

export const radarSeries: RadarSeries[] = [
  { label: "self", values: [4, 5, 3, 4, 3, 4, 2, 3], color: "var(--accent)", opacity: 0.3 },
  { label: "rater mean", values: [3, 4, 4, 5, 3, 3, 4, 4], color: "var(--domain-people)", opacity: 0.3 },
];

export const networkNodes: NetworkNode[] = [
  { id: "you", label: "You", type: "direct", domain: "executive", indegree: 0, outdegree: 9 },
  { id: "amir", label: "Amir", type: "direct", domain: "engineering", indegree: 5, outdegree: 2 },
  { id: "priya", label: "Priya", type: "direct", domain: "product", indegree: 4, outdegree: 3 },
  { id: "jo", label: "Jo", type: "direct", domain: "sales", indegree: 3, outdegree: 1 },
  { id: "lena", label: "Lena", type: "bridge", domain: "design", indegree: 6, outdegree: 4 },
  { id: "sam", label: "Sam", type: "skip", domain: "engineering", indegree: 2, outdegree: 1 },
  { id: "chen", label: "Chen", type: "skip", domain: "product", indegree: 1, outdegree: 0 },
  { id: "dot", label: "Dot", type: "isolate", domain: "finance", indegree: 0, outdegree: 0 },
];

export const networkEdges: NetworkEdge[] = [
  { from: "you", to: "amir", type: "collaboration", strength: 4 },
  { from: "you", to: "priya", type: "collaboration", strength: 3 },
  { from: "you", to: "jo", type: "decision", strength: 2 },
  { from: "you", to: "lena", type: "information", strength: 3 },
  { from: "amir", to: "sam", type: "collaboration", strength: 3 },
  { from: "priya", to: "chen", type: "information", strength: 2 },
  { from: "lena", to: "jo", type: "blocker", strength: 2 },
  { from: "lena", to: "amir", type: "collaboration", strength: 2 },
];

export const ganttItems: GanttItem[] = [
  { label: "Auth redesign", startFrac: 0.02, endFrac: 0.42, state: "atRisk", trend: "up" },
  { label: "Pricing page revamp", startFrac: 0.18, endFrac: 0.55, state: "done", trend: "flat" },
  { label: "API v3 migration", startFrac: 0.4, endFrac: 0.95, state: "planned", trend: "up" },
  { label: "Board reporting automation", startFrac: 0.68, endFrac: 1.0, state: "blocked", trend: "blocked" },
];
export const ganttToday = 0.55;
export const ganttColumns = ["Q3 '26", "Q4 '26", "Q1 '27"];

export const cohortRows: CohortRow[] = [
  { cohort: "Q3 '26", m1: 92.1, m3: 81.4, m6: 72.3, m12: null },
  { cohort: "Q2 '26", m1: 89.3, m3: 76.2, m6: 61.8, m12: 52.1 },
  { cohort: "Q1 '26", m1: 91.2, m3: 78.9, m6: 65.3, m12: 48.7 },
  { cohort: "Q4 '25", m1: 88.4, m3: 74.1, m6: 58.9, m12: 44.2 },
];

export const calibrationBuckets: CalibrationBucket[] = [
  { bucketLabel: "0-40%", statedMid: 20, accuracy: 38, n: 5 },
  { bucketLabel: "40-60%", statedMid: 50, accuracy: 47, n: 9 },
  { bucketLabel: "60-80%", statedMid: 70, accuracy: 64, n: 12 },
  { bucketLabel: "80-100%", statedMid: 90, accuracy: 71, n: 7 },
];
export const calibrationTotalN = 33;
export const calibrationSampleMin = 20;
export const calibrationWindowDays = 90;

// ---- extra sample series feeding the dashboard compositions ----

export const burnRateSeries: LineSeries[] = [
  {
    label: "net burn ($k/mo)",
    color: "var(--sev-4)",
    conf: "high",
    points: Array.from({ length: 12 }).map((_, i) => ({
      x: `2025-${String(i + 1).padStart(2, "0")}-01`,
      y: 180 + Math.round(Math.sin(i / 3) * 20 + i * 4),
    })),
  },
];

export const unitEconomics = [
  { segment: "SMB", ltvCac: 2.1, cac: 1_200, paybackMo: 11 },
  { segment: "Mid-market", ltvCac: 3.4, cac: 4_800, paybackMo: 8 },
  { segment: "Enterprise", ltvCac: 4.8, cac: 22_000, paybackMo: 14 },
];

export const riskRegister = [
  { risk: "Runway < 9 months at current burn", severity: 5, owner: "CFO", status: "open" },
  { risk: "Single customer >30% of revenue", severity: 4, owner: "CRO", status: "open" },
  { risk: "Key engineer flight risk (Amir)", severity: 3, owner: "CTO", status: "mitigating" },
  { risk: "SOC2 renewal lapsing", severity: 2, owner: "Legal", status: "scheduled" },
];

export const kpiTable = [
  { kpi: "ARR ($M)", value: "16.8", trend: [14.1, 14.6, 15.0, 15.4, 15.9, 16.2, 16.5, 16.8] },
  { kpi: "Logo churn (mo)", value: "1.4%", trend: [1.1, 1.2, 1.0, 1.3, 1.5, 1.3, 1.4, 1.4] },
  { kpi: "NRR", value: "108%", trend: [112, 110, 109, 111, 109, 108, 107, 108] },
  { kpi: "Headcount", value: "142", trend: [118, 122, 126, 130, 134, 137, 140, 142] },
];

export const runway = { months: 7.2, cashOut: "2026-05-14" };
export const ruleOf40 = { growth: 24, profitMargin: 6 }; // sums to 30, below 40 line

export const headcountSparkline = Array.from({ length: 90 }).map(
  (_, i) => 118 + Math.floor(i / 7) + (i % 11 === 0 ? 1 : 0)
);

export const directs = [
  { name: "Amir", load: [3, 4, 3, 4, 5, 4, 4], mood: [4, 4, 3, 3, 4, 4, 3], positive: 8, corrective: 2 },
  { name: "Priya", load: [2, 3, 3, 2, 3, 3, 2], mood: [5, 4, 4, 5, 4, 4, 5], positive: 11, corrective: 1 },
  { name: "Jo", load: [4, 5, 5, 4, 5, 5, 4], mood: [2, 2, 3, 2, 2, 1, 2], positive: 3, corrective: 6 },
  { name: "Lena", load: [3, 3, 4, 3, 3, 4, 3], mood: [4, 3, 4, 4, 3, 4, 4], positive: 7, corrective: 3 },
];

export const oneOnOneCadence = genCalendarActivity(13); // ~13 weeks, inline in #/roster

export const patternList = [
  { pattern: "Dismissal rate on R103 (margin) rising", severity: 4, domain: "finance" },
  { pattern: "1:1 cadence with Jo slipping beyond 14d", severity: 3, domain: "people" },
  { pattern: "Snooze-fatigue on board-prep reminders (4x)", severity: 2, domain: "executive" },
  { pattern: "Playbook completion rate down 18pp this quarter", severity: 3, domain: "operations" },
];

export const correlationClusters = [
  {
    cluster: "Margin pressure",
    members: ["fin.pl.logged: COGS variance", "sales.deal.logged: discount creep", "ops.vendor.logged: price increase"],
  },
  {
    cluster: "People risk",
    members: ["people.oneonone.logged: cadence gap (Jo)", "people.pulse.logged: mood decline (Jo)", "people.feedback.logged: corrective ratio (Jo)"],
  },
];

export const benchmarkGaps = [
  { metric: "Gross margin", you: 58, benchmark: 72, gap: -14 },
  { metric: "Rule of 40", you: 30, benchmark: 40, gap: -10 },
  { metric: "NRR", you: 108, benchmark: 115, gap: -7 },
  { metric: "LTV:CAC (blended)", you: 3.1, benchmark: 3.0, gap: 0.1 },
];

export const domainScoreSparklines = domainHeatmap.slice(0, 7).map((d) => ({
  domain: d.label,
  color: d.color,
  series: Array.from({ length: 30 }).map((_, i) => Math.round(d.value + Math.sin(i / 5) * 1.5)),
}));

export const energyTimeline = Array.from({ length: 30 }).map((_, i) => 6 + Math.round(Math.sin(i / 4) * 2));

export const legacyScorecard = [
  { label: "Talent developed", actual: 6, target: 8, ranges: [{ lo: 0, hi: 4, label: "low", color: "var(--sev-5)" }, { lo: 4, hi: 7, label: "mid", color: "var(--sev-3)" }, { lo: 7, hi: 10, label: "high", color: "var(--sev-1)" }] },
  { label: "Systems built", actual: 7, target: 7, ranges: [{ lo: 0, hi: 4, label: "low", color: "var(--sev-5)" }, { lo: 4, hi: 7, label: "mid", color: "var(--sev-3)" }, { lo: 7, hi: 10, label: "high", color: "var(--sev-1)" }] },
  { label: "Culture health", actual: 5, target: 8, ranges: [{ lo: 0, hi: 4, label: "low", color: "var(--sev-5)" }, { lo: 4, hi: 7, label: "mid", color: "var(--sev-3)" }, { lo: 7, hi: 10, label: "high", color: "var(--sev-1)" }] },
  { label: "Financial stewardship", actual: 6, target: 9, ranges: [{ lo: 0, hi: 4, label: "low", color: "var(--sev-5)" }, { lo: 4, hi: 7, label: "mid", color: "var(--sev-3)" }, { lo: 7, hi: 10, label: "high", color: "var(--sev-1)" }] },
  { label: "External reputation", actual: 7, target: 7, ranges: [{ lo: 0, hi: 4, label: "low", color: "var(--sev-5)" }, { lo: 4, hi: 7, label: "mid", color: "var(--sev-3)" }, { lo: 7, hi: 10, label: "high", color: "var(--sev-1)" }] },
];

export const avoidanceTracker = [
  { domain: "legal", daysSinceTouch: 61, note: "no contract review logged this quarter" },
  { domain: "manufacturing", daysSinceTouch: 48, note: "no floor walk logged since Aug" },
  { domain: "supplyChain", daysSinceTouch: 39, note: "vendor QBR overdue" },
];

export const reflectionStreak = 11; // consecutive weeks with a reflection.logged entry
