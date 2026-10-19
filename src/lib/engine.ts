import type { Severity } from "@/components/leados/ui/tokens";

/**
 * LEADOS demo data engine.
 *
 * Every "Understand" / "Act" view is driven by this module instead of static
 * fixtures or ComingSoon placeholders. Data is generated with a seeded PRNG
 * so server-rendered output is deterministic (no hydration mismatches) while
 * still looking like a live leadership dataset: people, projects, decisions,
 * signals, hypotheses, financials, playbooks, a collaboration network and a
 * Monte-Carlo-style forecast with uncertainty bands.
 */

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(min + rand() * (max - min + 1));
}
function float(min: number, max: number, dp = 2): number {
  return Number((min + rand() * (max - min)).toFixed(dp));
}

const FIRST_NAMES = [
  "Amara", "Leo", "Priya", "Noah", "Ingrid", "Marcus", "Sofia", "Kenji", "Elena", "Tobias",
  "Zuri", "Oscar", "Maya", "Felix", "Nadia", "Theo", "Ivy", "Hassan", "Clara", "Dmitri",
];
const LAST_NAMES = [
  "Okafor", "Bergström", "Rao", "Keller", "Lindqvist", "Alvarez", "Nakamura", "Hoffmann", "Petrova", "Osei",
];
const TEAMS = ["Product", "Engineering", "Revenue", "Operations", "Finance", "People"] as const;
const ROLES = ["IC", "Lead", "Manager", "Director", "VP"] as const;

export type Person = {
  id: string;
  name: string;
  role: (typeof ROLES)[number];
  team: (typeof TEAMS)[number];
  tenureMonths: number;
  sentiment: number; // 0-1
  engagement: number; // 0-1
  flightRisk: number; // 0-1
  lastCheckIn: string;
};

export function generatePeople(count = 24): Person[] {
  return Array.from({ length: count }).map((_, i) => {
    const sentiment = float(0.25, 0.97);
    return {
      id: `p-${i + 1}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      role: pick([...ROLES]),
      team: pick([...TEAMS]),
      tenureMonths: int(2, 96),
      sentiment,
      engagement: float(0.3, 0.98),
      flightRisk: Number((1 - sentiment + float(-0.15, 0.15)).toFixed(2)),
      lastCheckIn: daysAgo(int(0, 21)),
    };
  });
}

export type Project = {
  id: string;
  name: string;
  owner: string;
  team: (typeof TEAMS)[number];
  status: "on-track" | "at-risk" | "blocked" | "complete";
  health: number;
  budgetUsed: number;
  budgetTotal: number;
  dueDate: string;
};

const PROJECT_NAMES = [
  "Northstar Pricing Overhaul", "Atlas Platform Migration", "Horizon Customer Portal", "Vector Onboarding Redesign",
  "Beacon Data Warehouse", "Summit Partner Program", "Lumen Mobile Rebuild", "Anchor Compliance Program",
  "Catalyst Growth Experiments", "Meridian Supply Automation",
];

export function generateProjects(count = 10): Project[] {
  return Array.from({ length: count }).map((_, i) => {
    const health = int(18, 98);
    const status: Project["status"] = health > 75 ? "on-track" : health > 50 ? "at-risk" : health > 25 ? "blocked" : "complete";
    return {
      id: `proj-${i + 1}`,
      name: PROJECT_NAMES[i % PROJECT_NAMES.length],
      owner: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      team: pick([...TEAMS]),
      status,
      health,
      budgetUsed: int(40, 480) * 1000,
      budgetTotal: int(500, 900) * 1000,
      dueDate: daysFromNow(int(-10, 120)),
    };
  });
}

export type Decision = {
  id: string;
  title: string;
  owner: string;
  status: "pending" | "approved" | "blocked";
  severity: Severity;
  dueDate: string;
  description: string;
};

const DECISION_TITLES = [
  "Approve Q3 pricing floor change", "Greenlight EU data residency build", "Reallocate platform headcount to Atlas",
  "Sunset legacy reporting API", "Approve vendor consolidation for support tooling", "Set renewal discount ceiling",
  "Freeze non-critical hiring in Operations", "Approve Horizon portal GA date", "Escalate Beacon warehouse vendor risk",
  "Decide on partner program tiering",
];

export function generateDecisions(count = 10): Decision[] {
  return Array.from({ length: count }).map((_, i) => {
    const severity = pick<Severity>(["critical", "warning", "caution", "info"]);
    return {
      id: `dec-${i + 1}`,
      title: DECISION_TITLES[i % DECISION_TITLES.length],
      owner: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      status: pick(["pending", "approved", "blocked"] as const),
      severity,
      dueDate: daysFromNow(int(-3, 21)),
      description:
        "Needs a leadership call this week — downstream teams are blocked until this is resolved and communicated.",
    };
  });
}

export type Signal = {
  id: string;
  title: string;
  source: string;
  severity: Severity;
  trend: "up" | "down" | "flat";
  summary: string;
  detectedAt: string;
};

const SIGNAL_TITLES = [
  "Support ticket volume up 32% week-over-week", "Enterprise churn risk cluster detected in Northeast region",
  "Positive sentiment spike after Horizon launch", "API latency regression on checkout path",
  "Competitor announced adjacent pricing change", "Engineering velocity down two sprints running",
  "Hiring pipeline conversion improving in Revenue", "Customer NPS detractors concentrated in onboarding",
];

export function generateSignals(count = 8): Signal[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: `sig-${i + 1}`,
    title: SIGNAL_TITLES[i % SIGNAL_TITLES.length],
    source: pick(["Support", "Product analytics", "Finance", "HRIS", "Market scan"]),
    severity: pick<Severity>(["critical", "warning", "caution", "good", "info"]),
    trend: pick(["up", "down", "flat"] as const),
    summary: "Detected by the monitoring engine from the last 14 days of operational data.",
    detectedAt: daysAgo(int(0, 10)),
  }));
}

export type Hypothesis = {
  id: string;
  statement: string;
  confidence: number;
  evidenceCount: number;
  status: "testing" | "supported" | "refuted";
};

const HYPOTHESES = [
  "Simplifying onboarding reduces 30-day churn for SMB accounts",
  "Weekly skip-levels reduce regretted attrition on Engineering",
  "Usage-based pricing increases expansion revenue in mid-market",
  "A dedicated partner tier accelerates channel-sourced pipeline",
  "Shorter release cycles improve customer-reported defect rate",
  "Manager span-of-control above 9 correlates with lower engagement",
];

export function generateHypotheses(): Hypothesis[] {
  return HYPOTHESES.map((statement, i) => ({
    id: `hyp-${i + 1}`,
    statement,
    confidence: float(0.3, 0.95),
    evidenceCount: int(3, 40),
    status: pick(["testing", "supported", "refuted"] as const),
  }));
}

export type Playbook = {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  lastRun: string;
  successRate: number;
};

export function generatePlaybooks(): Playbook[] {
  const defs: [string, string, string[]][] = [
    ["Churn save motion", "Health score drops below 40", ["Alert CSM", "Schedule exec check-in", "Offer tailored success plan"]],
    ["Incident comms", "P1 incident declared", ["Open status page", "Notify enterprise accounts", "Publish postmortem in 72h"]],
    ["Regretted attrition response", "High performer flags flight risk", ["Manager + HRBP huddle", "Retention conversation within 48h", "Comp review"]],
    ["Budget overrun escalation", "Project burn exceeds 90% of budget", ["Notify finance", "Freeze discretionary spend", "Exec review"]],
  ];
  return defs.map(([name, trigger, steps], i) => ({
    id: `pb-${i + 1}`,
    name,
    trigger,
    steps,
    lastRun: daysAgo(int(1, 30)),
    successRate: float(0.55, 0.95),
  }));
}

export type ExecutionItem = {
  id: string;
  title: string;
  owner: string;
  status: "not-started" | "in-progress" | "blocked" | "done";
  priority: "P0" | "P1" | "P2";
  dueDate: string;
};

const EXEC_TITLES = [
  "Ship Horizon portal beta to design partners", "Close Q3 pricing experiment readout", "Migrate billing to Atlas schema",
  "Finish SOC2 evidence collection", "Launch partner enablement kit", "Resolve checkout latency regression",
  "Complete manager training rollout", "Deliver board deck for strategic review",
];

export function generateExecutionItems(count = 8): ExecutionItem[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: `exec-${i + 1}`,
    title: EXEC_TITLES[i % EXEC_TITLES.length],
    owner: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    status: pick(["not-started", "in-progress", "blocked", "done"] as const),
    priority: pick(["P0", "P1", "P2"] as const),
    dueDate: daysFromNow(int(-5, 45)),
  }));
}

export type NetworkGraph = {
  nodes: { id: string; label: string; group: number }[];
  edges: { source: string; target: string; weight: number }[];
};

export function generateNetwork(): NetworkGraph {
  const people = generatePeople(10);
  const nodes = people.map((p, i) => ({ id: p.id, label: p.name.split(" ")[0], group: i % 6 }));
  const edges: NetworkGraph["edges"] = [];
  for (let i = 0; i < nodes.length; i++) {
    const edgeCount = int(1, 3);
    for (let j = 0; j < edgeCount; j++) {
      const target = nodes[int(0, nodes.length - 1)];
      if (target.id !== nodes[i].id) edges.push({ source: nodes[i].id, target: target.id, weight: int(1, 3) });
    }
  }
  return { nodes, edges };
}

/** Monte-Carlo-flavoured forecast: a mean path plus a widening confidence band. */
export function generateForecast(periods = 12, base = 100) {
  const labels = Array.from({ length: periods }).map((_, i) => monthLabel(i));
  const actualCount = Math.floor(periods * 0.6);
  let value = base;
  const actual: number[] = [];
  const forecastBand: { low: number; high: number }[] = [];
  const forecastMean: number[] = [];

  for (let i = 0; i < periods; i++) {
    value = value * (1 + float(-0.03, 0.07));
    if (i < actualCount) {
      actual.push(Number(value.toFixed(1)));
      forecastMean.push(Number(value.toFixed(1)));
      forecastBand.push({ low: Number(value.toFixed(1)), high: Number(value.toFixed(1)) });
    } else {
      const spread = value * 0.04 * (i - actualCount + 1);
      forecastMean.push(Number(value.toFixed(1)));
      forecastBand.push({ low: Number((value - spread).toFixed(1)), high: Number((value + spread).toFixed(1)) });
    }
  }
  return { labels, actual, forecastMean, forecastBand, actualCount };
}

export function generateMetricSeries(periods = 12, base = 100, volatility = 0.08) {
  let value = base;
  const points: number[] = [];
  for (let i = 0; i < periods; i++) {
    value = Math.max(1, value * (1 + float(-volatility, volatility)));
    points.push(Number(value.toFixed(1)));
  }
  return points;
}

export function generateFinancialWaterfall() {
  return [
    { label: "Starting ARR", delta: 4200000, isTotal: true },
    { label: "New business", delta: 620000 },
    { label: "Expansion", delta: 310000 },
    { label: "Churn", delta: -280000 },
    { label: "Contraction", delta: -95000 },
    { label: "Ending ARR", delta: 4200000 + 620000 + 310000 - 280000 - 95000, isTotal: true },
  ];
}

export function generateBudgetRows() {
  return TEAMS.map((team) => ({
    team,
    budget: int(400, 1200) * 1000,
    spent: int(250, 1100) * 1000,
    headcount: int(8, 60),
  }));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 6 + offset);
  return d.toLocaleDateString("en-US", { month: "short" });
}

/** Cross-entity "Now" queue: the highest-severity items a leader must see today. */
export function getNowAttention() {
  const decisions = generateDecisions();
  const signals = generateSignals();
  const execution = generateExecutionItems();

  const severityWeight: Record<Severity, number> = { critical: 5, warning: 4, caution: 3, info: 2, good: 1, neutral: 0 };

  const items = [
    ...decisions
      .filter((d) => d.status !== "approved")
      .map((d) => ({
        id: d.id,
        kind: "decision" as const,
        title: d.title,
        severity: d.severity,
        href: "/act/decisions",
        meta: `Owner: ${d.owner} · Due ${new Date(d.dueDate).toLocaleDateString()}`,
      })),
    ...signals
      .filter((s) => s.severity === "critical" || s.severity === "warning")
      .map((s) => ({
        id: s.id,
        kind: "signal" as const,
        title: s.title,
        severity: s.severity,
        href: "/understand/signals",
        meta: `Source: ${s.source}`,
      })),
    ...execution
      .filter((e) => e.status === "blocked" || e.priority === "P0")
      .map((e) => ({
        id: e.id,
        kind: "execution" as const,
        title: e.title,
        severity: (e.status === "blocked" ? "critical" : "warning") as Severity,
        href: "/act/execution",
        meta: `Owner: ${e.owner} · ${e.status.replace("-", " ")}`,
      })),
  ];

  return items.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]).slice(0, 8);
}
