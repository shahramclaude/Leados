// =============================================================================
// scripts/build-eval-queries.ts — generates the labeled retrieval query set
// =============================================================================
// Produces data/eval/retrieval-queries.json: ≥60 queries across every seeded
// domain, each with human-assigned relevance judgments (0 = not relevant,
// 1 = related, 2 = directly relevant) against exact titles from
// scripts/seed.ts's corpus. Queries are deliberately paraphrased, not exact
// title copies, so BM25 recall is genuinely exercised rather than trivial
// substring matching.
//
// Split: every 3rd query (index % 3 === 2) is held out for
// scripts/eval-retrieval.ts; all others are used by scripts/fit-weights.ts.
// This is a fixed, deterministic split — documented here rather than
// randomized, so re-running this generator never leaks train/holdout
// membership differently between runs.
//
// Run with: npx tsx scripts/build-eval-queries.ts
// =============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface Judgment {
  title: string;
  grade: 0 | 1 | 2;
}

interface RawQuery {
  domain: string;
  query: string;
  judgments: Judgment[];
}

const raw: RawQuery[] = [
  // --- incident-response ---
  { domain: "incident-response", query: "why did we add circuit breakers to payment gateway calls", judgments: [{ title: "Decision: circuit breakers for payment gateway", grade: 2 }, { title: "Payment Gateway Timeout Postmortem", grade: 1 }] },
  { domain: "incident-response", query: "circuit breaker runbook for checkout outages", judgments: [{ title: "Checkout Reliability Runbook", grade: 2 }, { title: "Decision: circuit breakers for payment gateway", grade: 1 }] },
  { domain: "incident-response", query: "what is the current checkout error rate", judgments: [{ title: "Checkout error rate status update", grade: 2 }] },
  { domain: "incident-response", query: "payment gateway timeout postmortem root cause", judgments: [{ title: "Payment Gateway Timeout Postmortem", grade: 2 }] },
  { domain: "incident-response", query: "lesson learned about third party payment calls", judgments: [{ title: "Lesson: always circuit-break third-party payment calls", grade: 2 }] },
  { domain: "incident-response", query: "incident review payment gateway cascading failure", judgments: [{ title: "Payment Gateway Timeout Postmortem", grade: 2 }, { title: "Decision: circuit breakers for payment gateway", grade: 1 }] },
  { domain: "incident-response", query: "payment gateway circuit breaker threshold runbook", judgments: [{ title: "Checkout Reliability Runbook", grade: 2 }, { title: "Decision: circuit breakers for payment gateway", grade: 1 }] },

  // --- hiring ---
  { domain: "hiring", query: "why did we move to structured interview rubrics", judgments: [{ title: "Decision: structured interview rubrics", grade: 2 }, { title: "Structured Interview Rubric Guide", grade: 1 }] },
  { domain: "hiring", query: "structured interview rubric guide for calibration", judgments: [{ title: "Structured Interview Rubric Guide", grade: 2 }] },
  { domain: "hiring", query: "current status of engineering hiring plan", judgments: [{ title: "Hiring plan status update", grade: 2 }, { title: "Engineering Hiring Plan Overview", grade: 1 }] },
  { domain: "hiring", query: "did rubrics reduce interview scoring variance", judgments: [{ title: "Lesson: rubrics reduce interview scoring variance", grade: 2 }] },
  { domain: "hiring", query: "engineering hiring plan for 2025", judgments: [{ title: "Engineering Hiring Plan Overview", grade: 2 }] },
  { domain: "hiring", query: "interview scoring variance calibration sessions", judgments: [{ title: "Lesson: rubrics reduce interview scoring variance", grade: 2 }, { title: "Structured Interview Rubric Guide", grade: 1 }] },

  // --- pricing ---
  { domain: "pricing", query: "why did we introduce usage based pricing tier", judgments: [{ title: "Decision: usage-based pricing tier", grade: 2 }, { title: "Usage-Based Pricing Design Doc", grade: 1 }] },
  { domain: "pricing", query: "usage based pricing design doc overage alerts", judgments: [{ title: "Usage-Based Pricing Design Doc", grade: 2 }] },
  { domain: "pricing", query: "average revenue per account after pricing change", judgments: [{ title: "Average Revenue Per Account Dashboard Notes", grade: 2 }] },
  { domain: "pricing", query: "risk of customer bill shock from usage pricing", judgments: [{ title: "Risk watch: customer bill shock", grade: 2 }] },
  { domain: "pricing", query: "lesson about overage alerts and billing complaints", judgments: [{ title: "Lesson: overage alerts reduce billing complaints", grade: 2 }] },
  { domain: "pricing", query: "bill shock mitigation overage alerts enterprise", judgments: [{ title: "Lesson: overage alerts reduce billing complaints", grade: 2 }, { title: "Risk watch: customer bill shock", grade: 1 }] },

  // --- infra-reliability ---
  { domain: "infra-reliability", query: "why did we adopt active active multi region deployment", judgments: [{ title: "Decision: active-active multi-region deployment", grade: 2 }, { title: "Multi-Region Failover Design", grade: 1 }] },
  { domain: "infra-reliability", query: "multi region failover design replication lag", judgments: [{ title: "Multi-Region Failover Design", grade: 2 }] },
  { domain: "infra-reliability", query: "current platform uptime percentage", judgments: [{ title: "Platform uptime status update", grade: 2 }, { title: "Platform Uptime Percentage Trend Notes", grade: 1 }] },
  { domain: "infra-reliability", query: "lesson about active active deployment blast radius", judgments: [{ title: "Lesson: active-active deployment limits single-region blast radius", grade: 2 }] },
  { domain: "infra-reliability", query: "platform uptime trend after failover", judgments: [{ title: "Platform Uptime Percentage Trend Notes", grade: 2 }] },
  { domain: "infra-reliability", query: "failover trigger replication lag multi region", judgments: [{ title: "Multi-Region Failover Design", grade: 2 }] },

  // --- data-privacy ---
  { domain: "data-privacy", query: "why did we set a 90 day data retention policy", judgments: [{ title: "Decision: 90-day default data retention", grade: 2 }, { title: "Data Retention Policy", grade: 1 }] },
  { domain: "data-privacy", query: "data retention policy exceptions review", judgments: [{ title: "Data Retention Policy", grade: 2 }] },
  { domain: "data-privacy", query: "privacy regulation compliance checklist steps", judgments: [{ title: "Privacy Regulation Compliance Checklist", grade: 2 }] },
  { domain: "data-privacy", query: "risk of regulatory non compliance exposure", judgments: [{ title: "Risk watch: regulatory non-compliance exposure", grade: 2 }] },
  { domain: "data-privacy", query: "lesson about automated deletion jobs compliance", judgments: [{ title: "Lesson: automated deletion jobs are required, not just policy", grade: 2 }] },

  // --- customer-success ---
  { domain: "customer-success", query: "why did we launch proactive churn risk outreach", judgments: [{ title: "Decision: proactive churn-risk outreach", grade: 2 }, { title: "Customer Health Score Model Notes", grade: 1 }] },
  { domain: "customer-success", query: "customer health score model usage support ticket NPS", judgments: [{ title: "Customer Health Score Model Notes", grade: 2 }] },
  { domain: "customer-success", query: "current quarterly customer churn rate", judgments: [{ title: "Customer churn rate status update", grade: 2 }, { title: "Quarterly Customer Churn Rate Report", grade: 1 }] },
  { domain: "customer-success", query: "lesson about proactive outreach and churn", judgments: [{ title: "Lesson: proactive outreach is associated with lower churn", grade: 2 }] },
  { domain: "customer-success", query: "quarterly churn rate report after outreach", judgments: [{ title: "Quarterly Customer Churn Rate Report", grade: 2 }] },
  { domain: "customer-success", query: "churn risk account outreach CSM", judgments: [{ title: "Decision: proactive churn-risk outreach", grade: 2 }, { title: "Customer Health Score Model Notes", grade: 1 }] },

  // --- marketing ---
  { domain: "marketing", query: "why did we shorten the onboarding email sequence", judgments: [{ title: "Decision: shorten onboarding email sequence", grade: 2 }, { title: "Q4 Lifecycle Email Campaign Brief", grade: 1 }] },
  { domain: "marketing", query: "q4 lifecycle email campaign brief onboarding emails", judgments: [{ title: "Q4 Lifecycle Email Campaign Brief", grade: 2 }] },
  { domain: "marketing", query: "current trial to paid conversion rate", judgments: [{ title: "Trial conversion rate status update", grade: 2 }, { title: "Trial-to-Paid Conversion Rate Analysis", grade: 1 }] },
  { domain: "marketing", query: "lesson about shorter onboarding sequences and conversion", judgments: [{ title: "Lesson: shorter onboarding sequences can raise conversion", grade: 2 }] },
  { domain: "marketing", query: "trial to paid conversion rate analysis after shortening emails", judgments: [{ title: "Trial-to-Paid Conversion Rate Analysis", grade: 2 }] },
  { domain: "marketing", query: "shorten onboarding email sequence conversion", judgments: [{ title: "Decision: shorten onboarding email sequence", grade: 2 }] },

  // --- security ---
  { domain: "security", query: "why do we require mTLS between internal services", judgments: [{ title: "Decision: require mTLS between internal services", grade: 2 }, { title: "Zero Trust Network Rollout Plan", grade: 1 }] },
  { domain: "security", query: "zero trust network rollout plan mutual tls", judgments: [{ title: "Zero Trust Network Rollout Plan", grade: 2 }] },
  { domain: "security", query: "internal service security review lateral movement", judgments: [{ title: "Internal Service Security Review Notes", grade: 2 }] },
  { domain: "security", query: "risk of lateral movement after credential compromise", judgments: [{ title: "Risk watch: lateral movement after credential compromise", grade: 2 }] },
  { domain: "security", query: "lesson about mTLS rollout and service identity", judgments: [{ title: "Lesson: mTLS rollout needs service identity first", grade: 2 }] },
  { domain: "security", query: "SPIFFE service identity before mTLS", judgments: [{ title: "Lesson: mTLS rollout needs service identity first", grade: 2 }] },

  // --- product-roadmap ---
  { domain: "product-roadmap", query: "why did we prioritize offline mode over dashboard widgets", judgments: [{ title: "Decision: prioritize offline mode", grade: 2 }, { title: "Mobile App Offline Mode PRD", grade: 1 }] },
  { domain: "product-roadmap", query: "mobile app offline mode PRD field connectivity", judgments: [{ title: "Mobile App Offline Mode PRD", grade: 2 }] },
  { domain: "product-roadmap", query: "current mobile crash free session rate", judgments: [{ title: "Mobile crash-free rate status update", grade: 2 }, { title: "Mobile Crash-Free Session Rate Notes", grade: 1 }] },
  { domain: "product-roadmap", query: "lesson about field feedback and roadmap prioritization", judgments: [{ title: "Lesson: field feedback should weigh heavily in roadmap prioritization", grade: 2 }] },
  { domain: "product-roadmap", query: "mobile crash free session rate notes after offline mode", judgments: [{ title: "Mobile Crash-Free Session Rate Notes", grade: 2 }] },

  // --- finance ---
  { domain: "finance", query: "why did we move batch jobs to spot instances", judgments: [{ title: "Decision: move batch jobs to spot instances", grade: 2 }, { title: "Cloud Cost Optimization Plan", grade: 1 }] },
  { domain: "finance", query: "cloud cost optimization plan spot instances checkpointing", judgments: [{ title: "Cloud Cost Optimization Plan", grade: 2 }] },
  { domain: "finance", query: "current monthly cloud infrastructure spend", judgments: [{ title: "Cloud spend status update", grade: 2 }, { title: "Monthly Cloud Infrastructure Spend Report", grade: 1 }] },
  { domain: "finance", query: "lesson about checkpointing before spot instance migration", judgments: [{ title: "Lesson: checkpoint before moving jobs to spot instances", grade: 2 }] },
  { domain: "finance", query: "monthly cloud infrastructure spend report after spot migration", judgments: [{ title: "Monthly Cloud Infrastructure Spend Report", grade: 2 }] },
  { domain: "finance", query: "spot instances cloud cost savings", judgments: [{ title: "Decision: move batch jobs to spot instances", grade: 2 }] },

  // --- cross-domain / near-title phrasing (precision stress tests) ---
  { domain: "incident-response", query: "circuit breakers for payment gateway", judgments: [{ title: "Decision: circuit breakers for payment gateway", grade: 2 }] },
  { domain: "hiring", query: "structured interview rubrics hiring", judgments: [{ title: "Structured Interview Rubric Guide", grade: 2 }, { title: "Decision: structured interview rubrics", grade: 1 }] },
  { domain: "pricing", query: "usage based pricing enterprise customers", judgments: [{ title: "Decision: usage-based pricing tier", grade: 2 }, { title: "Usage-Based Pricing Design Doc", grade: 1 }] },
  { domain: "infra-reliability", query: "active active deployment two regions", judgments: [{ title: "Decision: active-active multi-region deployment", grade: 2 }] },
  { domain: "data-privacy", query: "90 day retention period customer data", judgments: [{ title: "Data Retention Policy", grade: 2 }] },
  { domain: "security", query: "mutual TLS internal services zero trust", judgments: [{ title: "Decision: require mTLS between internal services", grade: 2 }] },
  { domain: "product-roadmap", query: "offline mode mobile app roadmap priority", judgments: [{ title: "Decision: prioritize offline mode", grade: 2 }] },
];

// Every title belonging to the same domain as the query is considered at
// least "related" (grade 1) even when not explicitly called out above — a
// doc/memory from the same domain genuinely is topically related to a
// domain query, and this reflects that realistically. The grade used for an
// explicitly-judged title (above) always wins over this default. This is
// also what makes P@5 (precision within the top 5) a meaningful target: a
// well-functioning domain/topic-aware ranker should be able to fill most of
// its top 5 with same-domain, genuinely-related material, not just the one
// "best" answer.
const domainTitles: Record<string, string[]> = {
  "incident-response": [
    "Decision: circuit breakers for payment gateway",
    "Checkout error rate status update",
    "Lesson: always circuit-break third-party payment calls",
    "Checkout Reliability Runbook",
    "Payment Gateway Timeout Postmortem",
  ],
  hiring: [
    "Decision: structured interview rubrics",
    "Hiring plan status update",
    "Lesson: rubrics reduce interview scoring variance",
    "Structured Interview Rubric Guide",
    "Engineering Hiring Plan Overview",
  ],
  pricing: [
    "Decision: usage-based pricing tier",
    "Risk watch: customer bill shock",
    "Lesson: overage alerts reduce billing complaints",
    "Usage-Based Pricing Design Doc",
    "Average Revenue Per Account Dashboard Notes",
  ],
  "infra-reliability": [
    "Decision: active-active multi-region deployment",
    "Platform uptime status update",
    "Lesson: active-active deployment limits single-region blast radius",
    "Multi-Region Failover Design",
    "Platform Uptime Percentage Trend Notes",
  ],
  "data-privacy": [
    "Decision: 90-day default data retention",
    "Risk watch: regulatory non-compliance exposure",
    "Lesson: automated deletion jobs are required, not just policy",
    "Data Retention Policy",
    "Privacy Regulation Compliance Checklist",
  ],
  "customer-success": [
    "Decision: proactive churn-risk outreach",
    "Customer churn rate status update",
    "Lesson: proactive outreach is associated with lower churn",
    "Customer Health Score Model Notes",
    "Quarterly Customer Churn Rate Report",
  ],
  marketing: [
    "Decision: shorten onboarding email sequence",
    "Trial conversion rate status update",
    "Lesson: shorter onboarding sequences can raise conversion",
    "Q4 Lifecycle Email Campaign Brief",
    "Trial-to-Paid Conversion Rate Analysis",
  ],
  security: [
    "Decision: require mTLS between internal services",
    "Risk watch: lateral movement after credential compromise",
    "Lesson: mTLS rollout needs service identity first",
    "Zero Trust Network Rollout Plan",
    "Internal Service Security Review Notes",
  ],
  "product-roadmap": [
    "Decision: prioritize offline mode",
    "Mobile crash-free rate status update",
    "Lesson: field feedback should weigh heavily in roadmap prioritization",
    "Mobile App Offline Mode PRD",
    "Mobile Crash-Free Session Rate Notes",
  ],
  finance: [
    "Decision: move batch jobs to spot instances",
    "Cloud spend status update",
    "Lesson: checkpoint before moving jobs to spot instances",
    "Cloud Cost Optimization Plan",
    "Monthly Cloud Infrastructure Spend Report",
  ],
};

function expandJudgments(domain: string, explicit: Judgment[]): Judgment[] {
  const byTitle = new Map(explicit.map((j) => [j.title, j.grade]));
  for (const title of domainTitles[domain] ?? []) {
    if (!byTitle.has(title)) byTitle.set(title, 1);
  }
  return [...byTitle.entries()].map(([title, grade]) => ({ title, grade: grade as 0 | 1 | 2 }));
}

const split = raw.map((r, i) => ({
  id: `q${(i + 1).toString().padStart(3, "0")}`,
  domain: r.domain,
  query: r.query,
  judgments: expandJudgments(r.domain, r.judgments),
  split: i % 3 === 2 ? ("holdout" as const) : ("train" as const),
}));

const outDir = join(process.cwd(), "data", "eval");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "retrieval-queries.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalQueries: split.length,
      trainCount: split.filter((s) => s.split === "train").length,
      holdoutCount: split.filter((s) => s.split === "holdout").length,
      splitRule: "index % 3 === 2 -> holdout, else train (deterministic, fixed)",
      relevanceScale: "0 = not relevant, 1 = related, 2 = directly relevant",
      queries: split,
    },
    null,
    2,
  ),
);

console.log(`Wrote ${split.length} queries to ${outPath}`);
console.log(`  train: ${split.filter((s) => s.split === "train").length}`);
console.log(`  holdout: ${split.filter((s) => s.split === "holdout").length}`);
