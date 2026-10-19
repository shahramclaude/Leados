import type {
  CausalLink,
  Decision,
  Domain,
  DomainKey,
  Finding,
  Hypothesis,
  OrgDataset,
  Severity,
} from "./types";

// ─────────────────────────────────────────────────────────────
// Seeded PRNG (mulberry32) — deterministic so the workspace feels
// stable across re-renders, but reseedable on "RUN ANALYSIS".
// ─────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DOMAIN_META: Record<DomainKey, { name: string; colorVar: string }> = {
  finance: { name: "Finance", colorVar: "--dc-finance" },
  people: { name: "People", colorVar: "--dc-people" },
  strategy: { name: "Strategy", colorVar: "--dc-strategy" },
  ops: { name: "Operations", colorVar: "--dc-ops" },
  rd: { name: "R&D", colorVar: "--dc-rd" },
  compliance: { name: "Compliance", colorVar: "--dc-compliance" },
  manufacturing: { name: "Manufacturing", colorVar: "--dc-manufacturing" },
  cs: { name: "Customer Success", colorVar: "--dc-cs" },
};

export const DOMAIN_KEYS = Object.keys(DOMAIN_META) as DomainKey[];

const RULE_BANK: { ruleId: string; title: string; basis: string; domain: DomainKey }[] = [
  { ruleId: "PPL-014", title: "Regret-attrition clustering in Platform org", basis: "3 of last 5 voluntary exits scored high-regret; manager span exceeds 9 direct reports", domain: "people" },
  { ruleId: "PPL-007", title: "Engagement velocity negative for 2nd consecutive cycle", basis: "pulse survey sentiment delta -0.6 vs prior quarter, response rate held at 81%", domain: "people" },
  { ruleId: "FIN-022", title: "Burn multiple drifting above plan", basis: "net new ARR growth slowed to 1.1x burn vs 1.6x target over trailing 3 months", domain: "finance" },
  { ruleId: "FIN-009", title: "Customer concentration risk in top account", basis: "single account now 18.4% of ARR, up from 11% two quarters ago", domain: "finance" },
  { ruleId: "STR-031", title: "Strategic initiative drift: Horizon-3 bet under-resourced", basis: "allocated headcount 40% below approved plan for 2 consecutive quarters", domain: "strategy" },
  { ruleId: "STR-012", title: "Competitive response window narrowing", basis: "2 competitor launches in adjacent category within 45 days", domain: "strategy" },
  { ruleId: "OPS-018", title: "Fulfillment SLA breach pattern", basis: "on-time-in-full fell below 92% threshold in 4 of last 6 weeks", domain: "ops" },
  { ruleId: "OPS-004", title: "Vendor single point of failure", basis: "primary logistics vendor represents 71% of shipped volume with no qualified backup", domain: "ops" },
  { ruleId: "RD-027", title: "R&D cycle time regression", basis: "median ship cycle extended from 11d to 19d over trailing 6 sprints", domain: "rd" },
  { ruleId: "RD-003", title: "Technical debt interest rate rising", basis: "bug-to-feature ratio crossed 1.4, up from 0.9 baseline", domain: "rd" },
  { ruleId: "CMP-011", title: "Regulatory filing deadline exposure", basis: "2 of 5 required filings lack assigned owner with 21 days remaining", domain: "compliance" },
  { ruleId: "CMP-002", title: "Access control drift detected", basis: "14 privileged accounts outside last quarterly access review", domain: "compliance" },
  { ruleId: "MFG-016", title: "Yield variance exceeding control limits", basis: "line 3 yield dropped to 87.2%, outside ±2σ control band", domain: "manufacturing" },
  { ruleId: "MFG-005", title: "Supplier lead-time inflation", basis: "average component lead time up 34% quarter over quarter", domain: "manufacturing" },
  { ruleId: "CS-021", title: "Support ticket severity mix worsening", basis: "sev-1 ticket share rose from 6% to 13% of volume month over month", domain: "cs" },
  { ruleId: "CS-008", title: "NPS detractor cluster in enterprise tier", basis: "detractor rate in accounts >$250k ARR up 9pts versus SMB tier", domain: "cs" },
];

const PLAYBOOKS: Record<string, string> = {
  "PPL-014": "Manager Span Rebalance",
  "FIN-022": "Burn Multiple Recovery",
  "STR-031": "Resourcing Realignment",
  "OPS-018": "SLA Recovery Sprint",
  "RD-027": "Cycle Time Reset",
  "CMP-011": "Filing Owner Assignment",
  "MFG-016": "Yield Root-Cause Drill",
  "CS-021": "Severity Triage Overhaul",
};

function sevFromRoll(r: number): Severity {
  if (r > 0.93) return 5;
  if (r > 0.78) return 4;
  if (r > 0.55) return 3;
  if (r > 0.3) return 2;
  return 1;
}

function buildHistory(rng: () => number, currentScore: number, velocity: number): Domain["history"] {
  const points: Domain["history"] = [];
  const checkpoints = [0, 7, 14, 30, 60, 90];
  for (const d of checkpoints) {
    const noise = (rng() - 0.5) * 0.6;
    const score = Math.min(10, Math.max(0, currentScore - (velocity * d) / 7 + noise));
    points.push({ daysAgo: d, score });
  }
  return points;
}

function makeDomains(rng: () => number): Domain[] {
  return DOMAIN_KEYS.map((key) => {
    const score = Math.round((3.5 + rng() * 6) * 10) / 10;
    const velocity = Math.round((rng() - 0.55) * 2.4 * 10) / 10;
    const dataDensity90d = Math.floor(rng() * 32);
    const meta = DOMAIN_META[key];
    return {
      key,
      name: meta.name,
      colorVar: meta.colorVar,
      score,
      velocity,
      dataDensity90d,
      history: buildHistory(rng, score, velocity),
    };
  });
}

function makeFindings(rng: () => number): Finding[] {
  const now = Date.now();
  const findings: Finding[] = RULE_BANK.map((r, i) => {
    const sev = sevFromRoll(rng());
    const confidence = Math.round((0.55 + rng() * 0.4) * 100) / 100;
    const hoursAgo = Math.floor(rng() * 96) + i;
    return {
      id: `fnd-${r.ruleId}`,
      domain: r.domain,
      sev,
      ruleId: r.ruleId,
      title: r.title,
      basis: r.basis,
      confidence,
      timestamp: new Date(now - hoursAgo * 3600_000).toISOString(),
      suggestedPlaybook: PLAYBOOKS[r.ruleId],
    };
  });

  // Wire up one deterministic cascade: PPL-014 amplifies CS-021
  const target = findings.find((f) => f.ruleId === "CS-021");
  if (target) {
    target.cascadeFromRuleId = "PPL-014";
    target.amplificationFactor = 1.6;
  }
  const target2 = findings.find((f) => f.ruleId === "OPS-018");
  if (target2) {
    target2.cascadeFromRuleId = "MFG-016";
    target2.amplificationFactor = 1.3;
  }

  return findings.filter(() => rng() > 0.08); // drop a few so count feels live
}

function makeDecisions(rng: () => number, domains: Domain[]): Decision[] {
  const now = Date.now();
  const titles = [
    "Approve manager span rebalance for Platform org",
    "Sign off on Q3 burn containment plan",
    "Reallocate 4 FTE to Horizon-3 initiative",
    "Select backup logistics vendor",
    "Assign owners to outstanding regulatory filings",
    "Greenlight yield root-cause investigation on Line 3",
  ];
  return titles.map((title, i) => ({
    id: `dec-${i}`,
    title,
    domain: domains[i % domains.length].key,
    deadline: new Date(now + (rng() * 96 - 12) * 3600_000).toISOString(),
  }));
}

function makeHypotheses(rng: () => number): Hypothesis[] {
  const now = Date.now();
  const bank: { title: string; status: Hypothesis["status"] }[] = [
    { title: "Span-of-control >8 correlates with regret attrition", status: "confirmed" },
    { title: "Burn multiple above 1.5x predicts runway miss within 2Q", status: "confirmed" },
    { title: "Vendor concentration >60% predicts SLA breach under demand shock", status: "open" },
    { title: "R&D cycle time regression is seasonal, not structural", status: "refuted" },
    { title: "NPS detractors in enterprise tier precede churn by 45-60 days", status: "open" },
    { title: "Filing delays cluster around leadership transitions", status: "confirmed" },
    { title: "Yield variance is supplier-driven, not process-driven", status: "open" },
  ];
  return bank.map((h, i) => ({
    id: `hyp-${i}`,
    title: h.title,
    status: h.status,
    createdAt: new Date(now - rng() * 60 * 86400_000).toISOString(),
    resolvedAt: h.status === "open" ? undefined : new Date(now - rng() * 20 * 86400_000).toISOString(),
  }));
}

function makeCausalLinks(rng: () => number): CausalLink[] {
  const defs = [
    { fromRuleId: "PPL-014", fromRuleLabel: "Regret-attrition clustering", toRuleId: "CS-021", toRuleLabel: "Support severity mix worsening", lagDays: 12, amplificationFactor: 1.6 },
    { fromRuleId: "MFG-016", fromRuleLabel: "Yield variance", toRuleId: "OPS-018", toRuleLabel: "Fulfillment SLA breach", lagDays: 6, amplificationFactor: 1.3 },
    { fromRuleId: "FIN-022", fromRuleLabel: "Burn multiple drift", toRuleId: "STR-031", toRuleLabel: "Horizon-3 under-resourced", lagDays: 21, amplificationFactor: 1.15 },
  ];
  return defs.map((d) => ({
    ...d,
    confidence: Math.round((0.6 + rng() * 0.3) * 100) / 100,
    strength: Math.round((0.4 + rng() * 0.55) * 100) / 100,
  }));
}

export function generateDataset(seed = 42): OrgDataset {
  const rng = mulberry32(seed);
  const domains = makeDomains(rng);
  const findings = makeFindings(rng);
  const decisions = makeDecisions(rng, domains);
  const hypotheses = makeHypotheses(rng);
  const causalLinks = makeCausalLinks(rng);
  return {
    domains,
    findings,
    decisions,
    hypotheses,
    causalLinks,
    lastRunAt: new Date(Date.now() - Math.floor(rng() * 5) * 60_000).toISOString(),
  };
}
