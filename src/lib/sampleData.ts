import type { DecisionRec, DomainKey, Goal, LeadosEvent, LeadosEventType, Person, Projection } from "./types";

/**
 * src/lib/sampleData.ts — deterministic demo dataset.
 *
 * DISCLOSURE: this is fabricated demo data, hand-authored so each physics
 * law in orgPhysics.ts/velocity.ts has something interesting to show
 * (a velocity alarm, low-data domains, a resonant pair, a depleted energy
 * budget). It is not connected to any real org. The anchor date (`TODAY`)
 * is fixed rather than `Date.now()` so the narrative is stable on reload.
 */

export const TODAY = new Date(Date.UTC(2025, 5, 15, 12, 0, 0)); // 2025-06-15

function daysAgoIso(n: number, hour = 9): string {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PEOPLE_SPEC: { name: string; title: string; tenureDays: number; reportsTo: string | null }[] = [
  { name: "Dana Whitfield", title: "CEO", tenureDays: 1400, reportsTo: null },
  { name: "Marcus Oyelaran", title: "VP Finance", tenureDays: 1100, reportsTo: "ceo" },
  { name: "Priya Narayan", title: "VP People", tenureDays: 980, reportsTo: "ceo" },
  { name: "Sam Keel", title: "VP Strategy", tenureDays: 640, reportsTo: "ceo" },
  { name: "Elena Vásquez", title: "VP Operations", tenureDays: 1250, reportsTo: "ceo" },
  { name: "Tobias Lindgren", title: "VP R&D", tenureDays: 820, reportsTo: "ceo" },
  { name: "Harriet Osei", title: "Compliance Lead", tenureDays: 410, reportsTo: null }, // broken line
  { name: "Noah Fujimoto", title: "Plant Manager", tenureDays: 1600, reportsTo: "ops" },
  { name: "Grace Ilunga", title: "CS Director", tenureDays: 300, reportsTo: "ceo" },
  { name: "Leo Marchetti", title: "Finance Analyst", tenureDays: 180, reportsTo: "finance" },
  { name: "Ingrid Solheim", title: "People Partner", tenureDays: 260, reportsTo: "people" },
  { name: "Oscar Delgado", title: "R&D Engineer", tenureDays: 90, reportsTo: null }, // broken line
  { name: "Mei Tanaka", title: "Ops Analyst", tenureDays: 45, reportsTo: "ops" },
  { name: "Robert Nkemelu", title: "Strategy Associate", tenureDays: 520, reportsTo: "ghost-manager" }, // broken line (manager doesn't exist)
];

export const PEOPLE: Person[] = PEOPLE_SPEC.map((p) => ({
  id: id("person"),
  name: p.name,
  title: p.title,
  createdAt: daysAgoIso(p.tenureDays),
  reportsTo: p.reportsTo,
}));

const peopleById: Record<string, Person> = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

// A reportsTo line is "broken" if it points to an id that isn't a real person id and isn't null.
const validIds = new Set(PEOPLE.map((p) => p.id));
const brokenLines = PEOPLE.filter((p) => p.reportsTo != null && !validIds.has(p.reportsTo)).map((p) => p.id);

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const GOAL_SPECS: { title: string; ownerIdx: number | null; setDaysAgo: number; lastProgressDaysAgo?: number }[] = [
  { title: "Close Q2 finance close process gap", ownerIdx: 1, setDaysAgo: 70, lastProgressDaysAgo: 4 },
  { title: "Reduce regrettable attrition", ownerIdx: 2, setDaysAgo: 120, lastProgressDaysAgo: 10 },
  { title: "Ship pricing model v2", ownerIdx: 3, setDaysAgo: 55, lastProgressDaysAgo: 50 }, // silent 30d+
  { title: "Rebalance plant shift coverage", ownerIdx: 4, setDaysAgo: 40, lastProgressDaysAgo: 2 },
  { title: "De-risk single-vendor R&D dependency", ownerIdx: 5, setDaysAgo: 95, lastProgressDaysAgo: 80 }, // silent
  { title: "Close SOC2 control gaps", ownerIdx: 6, setDaysAgo: 30, lastProgressDaysAgo: 3 },
  { title: "Cut CS first-response time", ownerIdx: 8, setDaysAgo: 65, lastProgressDaysAgo: 60 }, // silent
  { title: "Undefined initiative — no clear owner", ownerIdx: null, setDaysAgo: 85, lastProgressDaysAgo: 85 }, // ownerless + silent
  { title: "Audit vendor contract renewals", ownerIdx: null, setDaysAgo: 20, lastProgressDaysAgo: 18 }, // ownerless
  { title: "Launch internal mobility program", ownerIdx: 2, setDaysAgo: 15, lastProgressDaysAgo: 1 },
];

export const OPEN_GOALS: Goal[] = GOAL_SPECS.map((g) => ({
  id: id("goal"),
  title: g.title,
  ownerId: g.ownerIdx != null ? PEOPLE[g.ownerIdx].id : null,
  ts: daysAgoIso(g.setDaysAgo),
  lastProgressTs: g.lastProgressDaysAgo != null ? daysAgoIso(g.lastProgressDaysAgo) : undefined,
}));

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const DECISION_SPECS: { title: string; loggedDaysAgo: number; resolvedDaysAgo?: number }[] = [
  { title: "Vendor consolidation for payroll", loggedDaysAgo: 60, resolvedDaysAgo: 40 },
  { title: "Freeze non-critical hiring", loggedDaysAgo: 50, resolvedDaysAgo: 30 },
  { title: "R&D roadmap re-prioritization", loggedDaysAgo: 75 }, // open
  { title: "Compliance remediation budget", loggedDaysAgo: 25 }, // open
  { title: "Plant 2 shift restructuring", loggedDaysAgo: 90, resolvedDaysAgo: 70 },
  { title: "CS tooling migration", loggedDaysAgo: 110, resolvedDaysAgo: 95 },
  { title: "Exec comp benchmarking", loggedDaysAgo: 15 }, // open
];

export const ALL_DECISIONS: DecisionRec[] = DECISION_SPECS.map((d) => ({
  id: id("dec"),
  title: d.title,
  ts: daysAgoIso(d.loggedDaysAgo),
  resolvedTs: d.resolvedDaysAgo != null ? daysAgoIso(d.resolvedDaysAgo) : undefined,
}));

export const OPEN_DECISIONS = ALL_DECISIONS.filter((d) => !d.resolvedTs);
export const decisionById: Record<string, DecisionRec> = Object.fromEntries(ALL_DECISIONS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const events: LeadosEvent[] = [];
function push(type: LeadosEventType, daysAgo: number, data: Record<string, any>, hour = 9) {
  events.push({ id: id("evt"), ts: daysAgoIso(daysAgo, hour), type, data });
}

// --- signal.raised, per domain (drives velocity + heatmap) ---------------
type SigSpec = [daysAgo: number, sev: number, title: string];

const SIGNALS: Record<DomainKey, SigSpec[]> = {
  // Accelerating hard — this domain should trip the velocity alarm.
  compliance: [
    [60, 2, "Minor policy doc drift"],
    [50, 2, "Vendor attestation overdue"],
    [42, 3, "Access review late"],
    [33, 3, "Control owner unassigned"],
    [27, 3, "Audit finding reopened"],
    [22, 4, "SOC2 control failing"],
    [17, 4, "Second control failing"],
    [13, 4, "Regulator inquiry received"],
    [9, 5, "Material control breach"],
    [6, 5, "Second breach, same control family"],
    [4, 5, "Remediation deadline missed"],
    [2, 5, "Escalated to legal"],
    [1, 4, "Board notified"],
    [0, 5, "New breach reported"],
  ],
  // Clearly improving — tenure investment paying off.
  people: [
    [85, 5, "Attrition spike in support team"],
    [75, 5, "Manager escalation — burnout"],
    [65, 4, "Engagement survey dip"],
    [55, 4, "Second escalation"],
    [45, 3, "Exit interview flags pay gap"],
    [35, 3, "Hiring backlog growing"],
    [28, 2, "Onboarding delay"],
    [20, 2, "Minor scheduling conflict"],
    [12, 1, "Pulse survey stabilizing"],
    [6, 1, "Positive 1:1 trend"],
    [2, 1, "Engagement back to baseline"],
  ],
  // Stable, moderate data.
  strategy: [
    [80, 3, "Competitor launched adjacent product"],
    [60, 2, "Roadmap slip, 1 week"],
    [45, 3, "Market sizing assumption questioned"],
    [30, 2, "OKR drift flagged"],
    [15, 3, "Partnership stalled"],
    [5, 2, "Pricing experiment inconclusive"],
  ],
  // Flat, well-covered.
  ops: [
    [88, 2, "Fulfillment delay, regional"],
    [80, 3, "SLA breach, minor"],
    [70, 2, "Vendor late shipment"],
    [60, 3, "Warehouse capacity tight"],
    [52, 2, "Routing inefficiency"],
    [44, 2, "SLA breach, minor"],
    [36, 3, "Staffing gap, weekend shift"],
    [28, 2, "Vendor late shipment"],
    [20, 3, "Backlog creeping up"],
    [14, 2, "Routing inefficiency"],
    [8, 3, "SLA breach, minor"],
    [3, 2, "Staffing gap, weekend shift"],
  ],
  // Sparse — low-confidence domain.
  rd: [
    [70, 3, "Single-vendor dependency flagged"],
    [40, 2, "Patent filing delayed"],
    [10, 4, "Key prototype failed QA"],
  ],
  // Moderate, mild variance.
  manufacturing: [
    [85, 2, "Line 3 downtime, short"],
    [70, 3, "Supplier defect rate up"],
    [55, 2, "Scrap rate above target"],
    [40, 3, "Line 3 downtime, short"],
    [25, 2, "Supplier defect rate up"],
    [12, 3, "Maintenance backlog"],
    [3, 2, "Scrap rate above target"],
  ],
  // Sparse and quietly worsening.
  cs: [
    [50, 2, "CSAT dip, one segment"],
    [30, 3, "Churn risk flagged, enterprise account"],
    [15, 4, "Second enterprise churn risk"],
    [5, 4, "Escalation to exec sponsor"],
  ],
  finance: [
    [84, 2, "Forecast variance, minor"],
    [76, 2, "AR aging creeping up"],
    [66, 3, "Budget overrun, marketing"],
    [58, 2, "Forecast variance, minor"],
    [48, 3, "AR aging creeping up"],
    [38, 2, "Vendor invoice dispute"],
    [30, 3, "Budget overrun, R&D"],
    [22, 2, "Forecast variance, minor"],
    [16, 2, "Cash conversion cycle up"],
    [9, 3, "AR aging creeping up"],
    [4, 2, "Vendor invoice dispute"],
  ],
};

(Object.keys(SIGNALS) as DomainKey[]).forEach((domain) => {
  SIGNALS[domain].forEach(([daysAgo, sev, title]) => {
    push("signal.raised", daysAgo, { domain, severity: sev, title });
  });
});

// --- resonance watchlist event types ---------------------------------------
// goal.progress — frequent, amplifying recently
[88, 80, 70, 60, 50, 40, 30, 22, 16, 11, 7, 4, 2, 1, 0].forEach((d, i) => push("goal.progress", d, { note: `progress update ${i + 1}` }));

// commitment.made — some overdue (drains energy), co-occurs with goal.progress
const COMMITMENTS: { daysAgo: number; byDaysFromNow: number }[] = [
  { daysAgo: 70, byDaysFromNow: -40 }, // overdue
  { daysAgo: 55, byDaysFromNow: -20 }, // overdue
  { daysAgo: 42, byDaysFromNow: -5 }, // overdue
  { daysAgo: 30, byDaysFromNow: 10 },
  { daysAgo: 22, byDaysFromNow: 20 },
  { daysAgo: 14, byDaysFromNow: 30 },
  { daysAgo: 8, byDaysFromNow: 45 },
  { daysAgo: 3, byDaysFromNow: 60 },
];
COMMITMENTS.forEach((c) => {
  const by = new Date(TODAY);
  by.setUTCDate(by.getUTCDate() + c.byDaysFromNow);
  push("commitment.made", c.daysAgo, { by_date: by.toISOString() });
});

// culture.signal — mostly positive recently (source energy), a few negative
[
  [90, "negative"],
  [70, "negative"],
  [55, "positive"],
  [40, "positive"],
  [28, "positive"],
  [18, "positive"],
  [10, "positive"],
  [5, "positive"],
  [2, "positive"],
].forEach(([d, pol]) => push("culture.signal", d as number, { polarity: pol }));

// decision.logged — mirrors ALL_DECISIONS timing (also a standalone watchlist signal)
ALL_DECISIONS.forEach((d) => {
  const daysAgo = Math.round((TODAY.getTime() - Date.parse(d.ts)) / 86400000);
  push("decision.logged", daysAgo, { title: d.title });
});

// conflict.resolved — intentionally sparse (<6) to show "insufficient data" state
[[45, {}], [12, {}]].forEach(([d]) => push("conflict.resolved", d as number, {}));

// info.pipeline.check — several blocked (drains energy, feeds information entropy)
const PIPELINE_CHECKS: { daysAgo: number; blocked: boolean }[] = [
  { daysAgo: 80, blocked: false },
  { daysAgo: 70, blocked: true },
  { daysAgo: 60, blocked: false },
  { daysAgo: 50, blocked: true },
  { daysAgo: 40, blocked: false },
  { daysAgo: 32, blocked: true },
  { daysAgo: 25, blocked: false },
  { daysAgo: 18, blocked: true },
  { daysAgo: 12, blocked: false },
  { daysAgo: 7, blocked: true },
  { daysAgo: 3, blocked: false },
  { daysAgo: 1, blocked: true },
];
PIPELINE_CHECKS.forEach((p) => push("info.pipeline.check", p.daysAgo, { blocked: p.blocked }));

// wins (feed leadership energy sources): plan.closed / goal.closed / ops.milestone.updated / conflict.resolved
[
  ["plan.closed", 25],
  ["goal.closed", 20],
  ["ops.milestone.updated", 14],
  ["goal.closed", 9],
  ["ops.milestone.updated", 4],
].forEach(([type, d]) => push(type as LeadosEventType, d as number, {}));

export const EVENTS: LeadosEvent[] = events;

export const PROJECTION: Projection = {
  people: PEOPLE,
  peopleById,
  openGoals: OPEN_GOALS,
  openDecisions: OPEN_DECISIONS,
  decisionById,
  lines: { broken: brokenLines },
  state: { events: EVENTS },
};
