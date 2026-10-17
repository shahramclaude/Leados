// Synthetic demo dataset — ORIGINAL to this build, not fetched or ported
// from github.com/wbweve/Leados. Deterministic (seeded PRNG) so the demo
// is reproducible across "Reset demo data" calls. Every event produced here
// is clearly a fabricated illustration of the pt-O schema, not real
// competitive intelligence.
import type { AppState, LeadEvent, Person, Deal, Okr } from "./types";
import { uid, isoDaysAgo } from "./format";

// mulberry32 seeded PRNG for determinism
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1));

export function buildSeedState(): AppState {
  const events: LeadEvent[] = [];
  const push = (type: string, daysAgo: number, data: Record<string, any>) =>
    events.push({ id: uid(), ts: isoDaysAgo(daysAgo), type, data });

  const people: Person[] = [
    { id: "p1", name: "A. Reyes", role: "CEO" },
    { id: "p2", name: "J. Okafor", role: "VP Engineering" },
    { id: "p3", name: "M. Lindqvist", role: "VP Sales" },
    { id: "p4", name: "S. Chen", role: "Head of CS" },
    { id: "p5", name: "D. Novak", role: "CFO" },
    { id: "p6", name: "R. Haddad", role: "Staff Engineer" },
    { id: "p7", name: "K. Osei", role: "Product Lead" },
    { id: "p8", name: "T. Ibarra", role: "AE" },
  ];

  const openOkrs: Okr[] = [
    { id: "okr1", objective: "Reach $1.2M net-new ARR this half" },
    { id: "okr2", objective: "Cut infra cost per customer 20%" },
    { id: "okr3", objective: "Ship platform-v2 GA" },
  ];

  const openDeals: Deal[] = [
    { id: "d1", name: "Northwind Logistics", value: 86000, stage: "negotiation" },
    { id: "d2", name: "Vertex Retail Group", value: 142000, stage: "proposal" },
    { id: "d3", name: "Caldera Health", value: 54000, stage: "discovery" },
  ];

  // --- Financial ---
  push("fin.kpi.logged", 3, { metric: "gross_margin_pct", value: 0.71 });
  push("fin.kpi.logged", 33, { metric: "gross_margin_pct", value: 0.69 });
  push("fin.runway.logged", 3, { months: 11.5 });
  push("fin.kpi.logged", 10, { metric: "nps_score", value: 34 });

  // --- People ---
  push("hr.headcount.planned", 20, { role: "Senior Backend Engineer", note: "platform-v2 support" });
  push("hr.headcount.planned", 45, { role: "Solutions Engineer" });
  push("hr.attrition.logged", 12, { personName: "former AE", reason: "comp" });
  push("hr.attrition.logged", 50, { personName: "former SRE", reason: "relocation" });

  // --- R&D / Tech ---
  for (let i = 0; i < 7; i++) {
    push("rd.experiment.result", int(2, 88), {
      name: pick(["pricing page test", "onboarding flow v3", "usage-based billing pilot", "latency reduction", "model eval harness"]),
      outcome: pick(["positive", "inconclusive", "negative"]),
    });
  }
  push("rd.patent.logged", 120, { title: "Adaptive workload scheduler" });
  push("rd.tech.debt.logged", 60, { title: "Legacy billing service", severity: 4, effort: 4 });
  push("rd.tech.debt.logged", 40, { title: "Auth token rotation gaps", severity: 3, effort: 2 });

  // --- GTM ---
  push("sales.deal.closed", 8, { result: "won", value: 61000 });
  push("sales.deal.closed", 15, { result: "won", value: 38000 });
  push("sales.deal.closed", 22, { result: "lost", value: 72000 });
  push("sales.deal.closed", 40, { result: "lost", value: 29000 });
  push("sales.deal.closed", 55, { result: "won", value: 45000 });
  push("win.loss.logged", 8, { result: "win", primary_reason: "integration depth", dealName: "won deal" });
  push("win.loss.logged", 22, { result: "loss", primary_reason: "price", dealName: "lost deal" });
  push("win.loss.logged", 40, { result: "loss", primary_reason: "missing SOC2", dealName: "lost deal" });

  // --- Ops ---
  for (let i = 0; i < 4; i++) {
    push("ops.incident.logged", int(2, 88), { title: pick(["API latency spike", "billing sync failure", "staging outage", "webhook delivery delay"]), severity: int(2, 4) });
  }
  for (let i = 0; i < 6; i++) {
    push("sprint.review", i * 14 + 2, { velocity_planned: 34, velocity_actual: int(22, 34) });
  }

  // --- Customers ---
  push("cs.health.logged", 5, { accountName: "Northwind Logistics", score: 2 });
  push("cs.health.logged", 9, { accountName: "Arcadia Freight", score: 2 });
  push("cs.health.logged", 18, { accountName: "Vertex Retail Group", score: 4 });
  push("cs.churn.logged", 15, { churned: 3, total: 58 });
  push("customer.pain", 11, { title: "No native SSO for enterprise tier", frequency: 5, severity: 4 });
  push("customer.pain", 20, { title: "Reporting export limited to CSV", frequency: 3, severity: 2 });
  push("customer.pain", 33, { title: "Rate limits too aggressive on bulk import", frequency: 4, severity: 3 });

  // --- Partnerships ---
  push("partnership.logged", 70, { name: "Data-layer reseller co-sell", status: "active" });
  push("partnership.logged", 200, { name: "Regional SI alliance", status: "dormant" });

  // --- Competitors (red team intel) ---
  const competitors = ["Halide Systems", "Fenwick Cloud", "Opaline Labs"];
  const categories = ["pricing", "product", "marketing", "hiring", "partnership"];
  competitors.forEach((name, idx) => {
    const n = 5 + idx * 2;
    for (let i = 0; i < n; i++) {
      push("competitor.logged", int(1, 120), {
        name,
        category: pick(categories),
        description: pick([
          "cut entry-tier pricing 15%",
          "launched usage analytics module",
          "ran a brand campaign at industry conference",
          "opened a new SE/solutions role req",
          "announced channel partnership with a systems integrator",
          "published a competitive comparison page naming us",
        ]),
        response_needed: rnd() > 0.7,
      });
    }
  });

  // --- Market signal ---
  push("market.signal", 25, { title: "Analyst note flags usage-based pricing as category trend", description: "Third-party analyst commentary, not primary research." });

  // --- pt-O: Wargaming ---
  push("wargame.scenario", 14, {
    name: "Respond to Halide's entry-tier price cut",
    trigger: "Halide Systems cut entry-tier pricing 15%",
    blueMove: "Hold price, bundle onboarding services for mid-market segment",
    turns: 4,
    outcome: "monitoring",
  });

  // --- pt-O: Strategic intelligence ---
  push("intel.signal", 6, {
    type: "customer",
    source: "QBR with Vertex Retail Group",
    content: "Buyer mentioned evaluating Fenwick Cloud for a parallel pilot",
    reliability: 3,
    implications: ["competitive displacement risk", "renewal timing"],
  });
  push("intel.signal", 29, {
    type: "OSINT",
    source: "Job postings",
    content: "Opaline Labs posted 3 reqs tagged 'enterprise compliance'",
    reliability: 2,
    implications: ["possible SOC2/FedRAMP push"],
  });

  // --- pt-O: M&A ---
  push("ma.target.logged", 40, {
    name: "Smallwell Analytics (hypothetical, illustrative)",
    rationale: "Would add native BI layer we currently lack",
    synergies: ["cross-sell to existing base", "shared infra"],
    risks: ["culture fit unknown", "integration cost unclear"],
    estimatedValue: 4200000,
    status: "exploring",
  });

  // --- pt-O: Regulatory ---
  push("reg.jurisdiction", 90, {
    name: "EU Data Protection",
    region: "EU",
    type: "supranational",
    relevantFrameworks: ["GDPR"],
    watchLevel: 3,
  });

  // --- pt-O: Org design ---
  push("org.design.scenario", 50, {
    name: "Split platform team into infra + product-platform",
    currentStructure: "Single platform team, 9 engineers",
    proposedStructure: "Two pods of 4-5, separate backlogs",
    hypothesis: "Reduces context switching, raises experiment velocity",
    expectedOutcome: "+15% velocity within 2 quarters (estimate, unvalidated)",
  });

  // --- pt-O: Tech disruption ---
  push("tech.disruption", 35, {
    technology: "Agentic workflow automation",
    maturityLevel: "growing",
    relevanceToUs: 4,
    timeHorizon_months: 12,
    threatOrOpportunity: "both",
  });

  // --- pt-O: Stakeholders ---
  push("stakeholder.mapped", 100, { name: "Lead Investor (Series B)", type: "investor", influence: 5, alignment: 4 });
  push("stakeholder.mapped", 100, { name: "Board Observer", type: "board", influence: 3, alignment: 3 });
  push("stakeholder.mapped", 60, { name: "Northwind Logistics (anchor customer)", type: "customer", influence: 4, alignment: 3 });

  // --- pt-O: Ecosystem ---
  push("ecosystem.map", 80, { name: "Cloud infra platform (hosting dependency)", role: "platform", strength: "strong", trend: "stable" });
  push("ecosystem.map", 80, { name: "Mid-market SI network", role: "distributor", strength: "moderate", trend: "growing" });

  events.sort((a, b) => (a.ts > b.ts ? 1 : -1));

  return { events, people, openOkrs, openDeals };
}
