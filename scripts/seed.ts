// =============================================================================
// scripts/seed.ts — seeds a realistic, multi-domain corpus for:
//   - manual exploration of the knowledge graph / memory UI
//   - the labeled retrieval eval set (data/eval/retrieval-queries.json)
//   - graph property tests (blast radius / shortest path / cycle detection)
//
// Run with: npx tsx scripts/seed.ts
// Idempotent-ish: truncates all Part 12 tables first, then reinserts.
// =============================================================================

import "dotenv/config";
import { db } from "../src/db";
import {
  entities,
  relations,
  memories,
  docs,
  retrospectives,
  playbooks,
  playbookRuns,
  evidenceLinks,
  relationClosure,
  consolidationRuns,
} from "../src/db/schema";
import { sql } from "drizzle-orm";

type LocalEntity = {
  key: string;
  type: "person" | "team" | "project" | "decision" | "hypothesis" | "risk" | "metric" | "playbook";
  name: string;
  summary: string;
};

type LocalRelation = {
  from: string;
  to: string;
  relationType: "caused" | "blocked" | "informs" | "supersedes" | "owns" | "depends_on" | "evidences";
  extractedBy: "rule" | "llm-proposal" | "human";
  confidenceClass: "observed" | "proposed" | "confirmed" | "rejected";
  provenanceSource: string;
};

type LocalDoc = { title: string; content: string; sourceKey: string };
type LocalMemory = {
  class: "decision" | "status" | "risk" | "metric" | "lesson";
  title: string;
  content: string;
  entityKey: string | null;
  sourceType: string;
  ageDaysOverride?: number;
};

type Domain = {
  key: string;
  entities: LocalEntity[];
  relations: LocalRelation[];
  docs: LocalDoc[];
  memories: LocalMemory[];
};

const domains: Domain[] = [
  {
    key: "incident-response",
    entities: [
      { key: "proj", type: "project", name: "Checkout Reliability Program", summary: "Program to reduce checkout downtime." },
      { key: "dec", type: "decision", name: "Adopt circuit breakers for payment gateway calls", summary: "Decision to wrap payment gateway calls in circuit breakers after repeated timeouts." },
      { key: "risk", type: "risk", name: "Payment gateway timeout cascades", summary: "Upstream payment gateway slowness cascades into checkout outages." },
      { key: "metric", type: "metric", name: "Checkout error rate", summary: "Percentage of checkout attempts returning a 5xx error." },
      { key: "team", type: "team", name: "Payments Platform Team", summary: "Owns the checkout and payments services." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "incident-review:INC-2024-118" },
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
      { from: "team", to: "proj", relationType: "owns", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "org-chart:2024-Q3" },
    ],
    docs: [
      { title: "Checkout Reliability Runbook", content: "This runbook describes how to respond to elevated checkout error rates, including circuit breaker thresholds, payment gateway fallback paths, and escalation contacts for the Payments Platform Team.", sourceKey: "proj" },
      { title: "Payment Gateway Timeout Postmortem", content: "On 2024-08-02, the payment gateway experienced a 40-minute latency spike. Checkout error rate crossed 12 percent before circuit breakers were manually engaged. Root cause: no automatic circuit breaking on gateway calls.", sourceKey: "risk" },
    ],
    memories: [
      { class: "decision", title: "Decision: circuit breakers for payment gateway", content: "We decided to add circuit breakers around all payment gateway calls after the August outage caused by cascading timeouts in checkout.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Checkout error rate status update", content: "Checkout error rate is currently at 0.4 percent, within normal bounds after the circuit breaker rollout.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: always circuit-break third-party payment calls", content: "Lesson learned: any synchronous call to a third-party payment gateway must have a circuit breaker and timeout budget, or cascading failures will take down checkout.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "hiring",
    entities: [
      { key: "proj", type: "project", name: "Engineering Hiring Plan 2025", summary: "Plan to hire 12 engineers across platform and product teams." },
      { key: "dec", type: "decision", name: "Move to structured interview rubrics", summary: "Decision to replace freeform interviews with structured rubrics." },
      { key: "risk", type: "risk", name: "Inconsistent interview scoring", summary: "Interviewers score candidates inconsistently without a shared rubric." },
      { key: "team", type: "team", name: "Talent Acquisition Team", summary: "Owns recruiting and interview process." },
      { key: "person", type: "person", name: "Dana Reyes", summary: "Head of Talent Acquisition." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "llm-proposal", confidenceClass: "proposed", provenanceSource: "llm-extraction:hiring-retro-notes" },
      { from: "person", to: "team", relationType: "owns", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "org-chart:2024-Q3" },
      { from: "dec", to: "proj", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:project-link" },
    ],
    docs: [
      { title: "Structured Interview Rubric Guide", content: "This guide defines the structured interview rubric used by the Talent Acquisition Team, covering technical depth, collaboration signals, and scoring calibration across interview panels.", sourceKey: "dec" },
      { title: "Engineering Hiring Plan Overview", content: "The Engineering Hiring Plan 2025 targets 12 hires across platform and product teams, with structured interview rubrics used for every loop to reduce scoring inconsistency.", sourceKey: "proj" },
    ],
    memories: [
      { class: "decision", title: "Decision: structured interview rubrics", content: "We decided to move every engineering interview loop onto a structured rubric after noticing wide scoring variance between interviewers on the same candidate.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Hiring plan status update", content: "Hiring plan is at 5 of 12 offers accepted for this quarter, on track against the structured rubric process.", entityKey: "proj", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: rubrics reduce interview scoring variance", content: "Lesson learned: introducing a structured rubric with calibration sessions measurably reduced scoring variance between interviewers for the same candidate.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "pricing",
    entities: [
      { key: "proj", type: "project", name: "Usage-Based Pricing Rollout", summary: "Rollout of usage-based pricing tier for enterprise customers." },
      { key: "dec", type: "decision", name: "Introduce usage-based pricing tier", summary: "Decision to add a usage-based pricing tier alongside flat-rate plans." },
      { key: "metric", type: "metric", name: "Average revenue per account", summary: "Average monthly revenue per enterprise account." },
      { key: "risk", type: "risk", name: "Customer bill shock", summary: "Customers may be surprised by variable bills under usage-based pricing." },
    ],
    relations: [
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
      { from: "risk", to: "dec", relationType: "blocked", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "pricing-review:2024-11" },
    ],
    docs: [
      { title: "Usage-Based Pricing Design Doc", content: "This document describes the usage-based pricing tier design, billing granularity, overage alerts, and mitigations for customer bill shock on enterprise accounts.", sourceKey: "dec" },
      { title: "Average Revenue Per Account Dashboard Notes", content: "Average revenue per account rose 8 percent after the usage-based pricing tier launched, driven by enterprise accounts exceeding their included usage.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: usage-based pricing tier", content: "We decided to introduce a usage-based pricing tier for enterprise customers, with overage alerts to reduce the risk of bill shock.", entityKey: "dec", sourceType: "decision-log" },
      { class: "risk", title: "Risk watch: customer bill shock", content: "Customer bill shock remains a tracked risk for the usage-based pricing tier; support tickets about unexpected charges are monitored weekly.", entityKey: "risk", sourceType: "risk-register" },
      { class: "lesson", title: "Lesson: overage alerts reduce billing complaints", content: "Lesson learned: proactive overage alerts sent before a bill is generated were associated with fewer billing-surprise support tickets than reactive billing alone.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "infra-reliability",
    entities: [
      { key: "proj", type: "project", name: "Multi-Region Failover Program", summary: "Program to add automatic failover between two cloud regions." },
      { key: "dec", type: "decision", name: "Adopt active-active multi-region deployment", summary: "Decision to run active-active across two regions instead of active-passive." },
      { key: "risk", type: "risk", name: "Single-region outage risk", summary: "A single region outage previously took down the entire platform." },
      { key: "metric", type: "metric", name: "Platform uptime percentage", summary: "Rolling 30-day platform uptime percentage." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "incident-review:INC-2024-073" },
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
    ],
    docs: [
      { title: "Multi-Region Failover Design", content: "This design document covers active-active multi-region deployment across two cloud regions, including data replication lag targets and automatic failover triggers for platform uptime.", sourceKey: "dec" },
      { title: "Platform Uptime Percentage Trend Notes", content: "Platform uptime percentage improved from 99.5 to 99.95 after active-active multi-region failover was enabled, reducing single-region outage impact.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: active-active multi-region deployment", content: "We decided to move from active-passive to active-active multi-region deployment after a single-region outage took down the whole platform.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Platform uptime status update", content: "Platform uptime percentage is currently at 99.96 percent over the trailing 30 days.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: active-active deployment limits single-region blast radius", content: "Lesson learned: active-active multi-region deployment was associated with a much smaller blast radius during the next regional outage compared to the prior active-passive setup.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "data-privacy",
    entities: [
      { key: "proj", type: "project", name: "Data Retention Compliance Project", summary: "Project to align data retention with new privacy regulation." },
      { key: "dec", type: "decision", name: "Adopt 90-day default data retention policy", summary: "Decision to default all customer data retention to 90 days unless legally required otherwise." },
      { key: "risk", type: "risk", name: "Regulatory non-compliance exposure", summary: "Exposure to fines from retaining customer data longer than permitted." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "legal-review:2024-09" },
    ],
    docs: [
      { title: "Data Retention Policy", content: "This policy sets a default 90-day retention period for customer data, with exceptions logged and reviewed quarterly to manage regulatory non-compliance exposure.", sourceKey: "dec" },
      { title: "Privacy Regulation Compliance Checklist", content: "Checklist for data retention compliance: classify data, confirm retention period, confirm deletion jobs run, document exceptions for the Data Retention Compliance Project.", sourceKey: "proj" },
    ],
    memories: [
      { class: "decision", title: "Decision: 90-day default data retention", content: "We decided to set a 90-day default data retention policy to reduce regulatory non-compliance exposure ahead of the new privacy regulation taking effect.", entityKey: "dec", sourceType: "decision-log" },
      { class: "risk", title: "Risk watch: regulatory non-compliance exposure", content: "Regulatory non-compliance exposure is reviewed quarterly as part of the data retention compliance project.", entityKey: "risk", sourceType: "risk-register" },
      { class: "lesson", title: "Lesson: automated deletion jobs are required, not just policy", content: "Lesson learned: writing a retention policy document was not enough; automated deletion jobs had to be built and monitored before the compliance exposure was actually reduced.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "customer-success",
    entities: [
      { key: "proj", type: "project", name: "Customer Health Score Initiative", summary: "Initiative to build a predictive customer health score." },
      { key: "dec", type: "decision", name: "Launch proactive churn-risk outreach", summary: "Decision to have CSMs proactively reach out to accounts flagged by the health score." },
      { key: "metric", type: "metric", name: "Quarterly customer churn rate", summary: "Percentage of customers churning per quarter." },
      { key: "risk", type: "risk", name: "Late detection of at-risk accounts", summary: "At-risk accounts were historically identified only after a cancellation request." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "llm-proposal", confidenceClass: "proposed", provenanceSource: "llm-extraction:cs-retro-notes" },
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
    ],
    docs: [
      { title: "Customer Health Score Model Notes", content: "The customer health score combines product usage, support ticket volume, and NPS to flag churn-risk accounts for proactive outreach by CSMs.", sourceKey: "proj" },
      { title: "Quarterly Customer Churn Rate Report", content: "Quarterly customer churn rate dropped from 4.1 to 3.2 percent after proactive churn-risk outreach began for accounts flagged by the health score.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: proactive churn-risk outreach", content: "We decided to launch proactive outreach from CSMs to accounts flagged as churn-risk by the new customer health score, instead of waiting for cancellation requests.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Customer churn rate status update", content: "Quarterly customer churn rate is currently 3.2 percent, down from 4.1 percent last quarter.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: proactive outreach is associated with lower churn", content: "Lesson learned: proactive churn-risk outreach was associated with a lower quarterly churn rate than waiting for cancellation requests, though CSM capacity limits how many accounts can be covered.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "marketing",
    entities: [
      { key: "proj", type: "project", name: "Q4 Lifecycle Email Campaign", summary: "Lifecycle email campaign targeting trial users." },
      { key: "dec", type: "decision", name: "Shorten trial onboarding email sequence", summary: "Decision to shorten the onboarding email sequence from 14 to 7 emails." },
      { key: "metric", type: "metric", name: "Trial-to-paid conversion rate", summary: "Percentage of trial users converting to paid." },
      { key: "risk", type: "risk", name: "Onboarding email fatigue", summary: "Trial users unsubscribing due to too many onboarding emails." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "llm-proposal", confidenceClass: "proposed", provenanceSource: "llm-extraction:marketing-retro-notes" },
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
    ],
    docs: [
      { title: "Q4 Lifecycle Email Campaign Brief", content: "This brief describes the shortened 7-email onboarding sequence for the Q4 lifecycle email campaign aimed at improving trial-to-paid conversion rate and reducing onboarding email fatigue.", sourceKey: "proj" },
      { title: "Trial-to-Paid Conversion Rate Analysis", content: "Trial-to-paid conversion rate increased from 11 to 13.5 percent after the onboarding email sequence was shortened from 14 to 7 emails.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: shorten onboarding email sequence", content: "We decided to shorten the trial onboarding email sequence from 14 to 7 emails after seeing high unsubscribe rates attributed to onboarding email fatigue.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Trial conversion rate status update", content: "Trial-to-paid conversion rate is currently 13.5 percent this quarter.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: shorter onboarding sequences can raise conversion", content: "Lesson learned: shortening the onboarding email sequence was associated with higher trial-to-paid conversion and fewer unsubscribes, suggesting fewer, higher-signal emails outperformed a long drip sequence here.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "security",
    entities: [
      { key: "proj", type: "project", name: "Zero Trust Network Rollout", summary: "Project to move internal services to a zero trust network model." },
      { key: "dec", type: "decision", name: "Require mTLS between internal services", summary: "Decision to require mutual TLS for all internal service-to-service calls." },
      { key: "risk", type: "risk", name: "Lateral movement after credential compromise", summary: "An attacker with one compromised credential could move laterally across internal services." },
    ],
    relations: [
      { from: "risk", to: "dec", relationType: "caused", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "security-review:2024-06" },
    ],
    docs: [
      { title: "Zero Trust Network Rollout Plan", content: "This plan describes the rollout of mutual TLS between internal services as part of the zero trust network initiative, reducing the blast radius of lateral movement after a credential compromise.", sourceKey: "dec" },
      { title: "Internal Service Security Review Notes", content: "The security review identified lateral movement after credential compromise as the top internal risk, recommending mTLS and service identity enforcement across the Zero Trust Network Rollout.", sourceKey: "proj" },
    ],
    memories: [
      { class: "decision", title: "Decision: require mTLS between internal services", content: "We decided to require mutual TLS between all internal services after a security review flagged lateral movement after credential compromise as a top risk.", entityKey: "dec", sourceType: "decision-log" },
      { class: "risk", title: "Risk watch: lateral movement after credential compromise", content: "Lateral movement after credential compromise is tracked as a high-severity risk until mTLS coverage reaches 100 percent of internal services.", entityKey: "risk", sourceType: "risk-register" },
      { class: "lesson", title: "Lesson: mTLS rollout needs service identity first", content: "Lesson learned: rolling out mTLS was slower than planned because service identity (SPIFFE IDs) had to be established first; sequencing identity before transport encryption would have saved a quarter.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
  {
    key: "product-roadmap",
    entities: [
      { key: "proj", type: "project", name: "Mobile App Offline Mode", summary: "Project to add offline-first support to the mobile app." },
      { key: "dec", type: "decision", name: "Prioritize offline mode over new dashboard widgets", summary: "Decision to prioritize offline mode in the roadmap ahead of new dashboard widgets." },
      { key: "metric", type: "metric", name: "Mobile app crash-free session rate", summary: "Percentage of mobile sessions without a crash." },
    ],
    relations: [
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
    ],
    docs: [
      { title: "Mobile App Offline Mode PRD", content: "This PRD describes offline-first support for the mobile app, prioritized ahead of new dashboard widgets based on customer feedback about connectivity issues in the field.", sourceKey: "proj" },
      { title: "Mobile Crash-Free Session Rate Notes", content: "Mobile app crash-free session rate improved after offline mode shipped, since the app no longer crashed on network loss during active use.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: prioritize offline mode", content: "We decided to prioritize offline mode in the mobile roadmap ahead of new dashboard widgets after field sales reported frequent connectivity issues.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Mobile crash-free rate status update", content: "Mobile app crash-free session rate is currently 99.2 percent after the offline mode release.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: field feedback should weigh heavily in roadmap prioritization", content: "Lesson learned: prioritizing offline mode based on direct field sales feedback was associated with a measurable crash-free rate improvement, more than the originally planned dashboard widgets would likely have delivered.", entityKey: "proj", sourceType: "retrospective" },
    ],
  },
  {
    key: "finance",
    entities: [
      { key: "proj", type: "project", name: "Cloud Cost Optimization Program", summary: "Program to reduce cloud infrastructure spend." },
      { key: "dec", type: "decision", name: "Move batch jobs to spot instances", summary: "Decision to move non-critical batch jobs to spot/preemptible instances." },
      { key: "metric", type: "metric", name: "Monthly cloud infrastructure spend", summary: "Total monthly cloud infrastructure cost." },
      { key: "risk", type: "risk", name: "Spot instance interruption impact", summary: "Batch jobs could be interrupted mid-run on spot instances." },
    ],
    relations: [
      { from: "dec", to: "metric", relationType: "informs", extractedBy: "rule", confidenceClass: "observed", provenanceSource: "automation:metric-link" },
      { from: "risk", to: "dec", relationType: "blocked", extractedBy: "human", confidenceClass: "confirmed", provenanceSource: "finance-review:2024-10" },
    ],
    docs: [
      { title: "Cloud Cost Optimization Plan", content: "This plan describes moving non-critical batch jobs to spot instances to reduce monthly cloud infrastructure spend, with checkpointing to mitigate spot instance interruption impact.", sourceKey: "dec" },
      { title: "Monthly Cloud Infrastructure Spend Report", content: "Monthly cloud infrastructure spend decreased by 18 percent after batch jobs moved to spot instances, with interruption-related reruns adding back about 2 percent of that savings.", sourceKey: "metric" },
    ],
    memories: [
      { class: "decision", title: "Decision: move batch jobs to spot instances", content: "We decided to move non-critical batch jobs to spot instances to reduce monthly cloud infrastructure spend, accepting some risk of spot instance interruption.", entityKey: "dec", sourceType: "decision-log" },
      { class: "status", title: "Cloud spend status update", content: "Monthly cloud infrastructure spend is down 18 percent quarter over quarter after the spot instance migration.", entityKey: "metric", sourceType: "status-update" },
      { class: "lesson", title: "Lesson: checkpoint before moving jobs to spot instances", content: "Lesson learned: adding checkpointing before migrating batch jobs to spot instances was associated with lower effective cost than migrating without it, since interrupted jobs could resume instead of restarting.", entityKey: "risk", sourceType: "retrospective" },
    ],
  },
];

async function reset() {
  await db.delete(consolidationRuns);
  await db.delete(relationClosure);
  await db.delete(evidenceLinks);
  await db.delete(playbookRuns);
  await db.delete(playbooks);
  await db.delete(retrospectives);
  await db.delete(memories);
  await db.delete(docs);
  await db.delete(relations);
  await db.delete(entities);
}

async function main() {
  console.log("Resetting Part 12 tables...");
  await reset();

  const idByKey = new Map<string, string>(); // `${domain}.${localKey}` -> entity id

  for (const domain of domains) {
    for (const e of domain.entities) {
      const [row] = await db.insert(entities).values({ type: e.type, name: e.name, summary: e.summary }).returning();
      idByKey.set(`${domain.key}.${e.key}`, row.id);
    }
  }
  console.log(`Inserted ${idByKey.size} entities.`);

  let relationCount = 0;
  for (const domain of domains) {
    for (const r of domain.relations) {
      await db.insert(relations).values({
        fromEntityId: idByKey.get(`${domain.key}.${r.from}`)!,
        toEntityId: idByKey.get(`${domain.key}.${r.to}`)!,
        relationType: r.relationType,
        extractedBy: r.extractedBy,
        confidenceClass: r.confidenceClass,
        provenanceSource: r.provenanceSource,
        confidence: r.confidenceClass === "confirmed" ? "0.9" : r.confidenceClass === "proposed" ? "0.55" : "0.8",
      });
      relationCount++;
    }
  }
  console.log(`Inserted ${relationCount} relations.`);

  let docCount = 0;
  for (const domain of domains) {
    for (const d of domain.docs) {
      await db.insert(docs).values({
        title: d.title,
        content: d.content,
        sourceEntityIds: [idByKey.get(`${domain.key}.${d.sourceKey}`)!],
      });
      docCount++;
    }
  }
  console.log(`Inserted ${docCount} docs.`);

  let memCount = 0;
  for (const domain of domains) {
    for (const m of domain.memories) {
      const ageDays = m.ageDaysOverride ?? (m.class === "status" ? 2 : m.class === "lesson" ? 20 : 10);
      const lastReactivatedAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
      await db.insert(memories).values({
        class: m.class,
        title: m.title,
        content: m.content,
        entityId: m.entityKey ? idByKey.get(`${domain.key}.${m.entityKey}`)! : null,
        strength: (m.class === "decision" ? 180 : m.class === "lesson" ? 220 : m.class === "risk" ? 60 : m.class === "metric" ? 30 : 7).toString(),
        lastReactivatedAt,
        provenanceSource: `seed:${domain.key}`,
        sourceType: m.sourceType,
      });
      memCount++;
    }
  }
  console.log(`Inserted ${memCount} memories.`);

  // A couple of completed retrospectives with real lessons + one playbook with run history.
  const incidentDec = idByKey.get("incident-response.dec")!;
  const [retro1] = await db
    .insert(retrospectives)
    .values({
      decisionEntityId: incidentDec,
      situation: "Repeated checkout outages traced to payment gateway timeouts cascading through the system.",
      decision: "Adopt circuit breakers for payment gateway calls",
      expectation: "Circuit breakers should isolate gateway slowness and keep checkout error rate under 1 percent.",
      outcome: "Checkout error rate dropped to 0.4 percent after rollout; no cascading outages in the following quarter.",
      lesson: "Circuit breakers around third-party payment calls were associated with eliminating cascading checkout outages.",
      outcomeVsExpectation: "Outcome appears consistent with expectation.",
      reviewAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      status: "completed",
    })
    .returning();

  const infraDec = idByKey.get("infra-reliability.dec")!;
  await db.insert(retrospectives).values({
    decisionEntityId: infraDec,
    situation: "A single-region outage took the whole platform down for 90 minutes.",
    decision: "Adopt active-active multi-region deployment",
    expectation: "Uptime should improve and single-region outages should no longer take down the whole platform.",
    reviewAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // future: still pending
    status: "pending",
  });

  const [playbook] = await db
    .insert(playbooks)
    .values({
      slug: "payment-gateway-outage-response",
      name: "Payment Gateway Outage Response",
      version: 1,
      trigger: { description: "Checkout error rate exceeds 2% for 5+ minutes" },
      steps: [
        { order: 1, text: "Check payment gateway status page and internal circuit breaker dashboard", owner: "on-call-engineer", verification: "Screenshot attached to incident channel" },
        { order: 2, text: "Confirm circuit breaker has tripped for the affected gateway", owner: "on-call-engineer", verification: "Circuit breaker metrics show open state" },
        { order: 3, text: "Notify Payments Platform Team lead", owner: "on-call-engineer", verification: "Acknowledgement received in incident channel" },
      ],
      status: "active",
      createdFromRetrospectiveId: retro1.id,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    .returning();

  const runOutcomes: Array<"success" | "success" | "partial" | "failure"> = ["success", "success", "success", "partial", "success", "failure"];
  for (const outcome of runOutcomes) {
    await db.insert(playbookRuns).values({
      playbookId: playbook.id,
      triggeredBy: "automation:checkout-alert",
      outcome,
      completedAt: new Date(),
      stepResults: [1, 2, 3].map((order) => ({ order, completed: outcome !== "failure" })),
    });
  }

  // A second, newer playbook with fewer runs (to exercise sample-size warnings).
  const [playbook2] = await db
    .insert(playbooks)
    .values({
      slug: "churn-risk-outreach",
      name: "Churn-Risk Account Outreach",
      version: 1,
      trigger: { description: "Customer health score drops below 40" },
      steps: [
        { order: 1, text: "CSM reviews account usage and support history", owner: "csm", verification: "Notes logged in CRM" },
        { order: 2, text: "CSM schedules outreach call within 2 business days", owner: "csm", verification: "Calendar invite sent" },
      ],
      status: "active",
      publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(playbookRuns).values([
    { playbookId: playbook2.id, triggeredBy: "automation:health-score-alert", outcome: "success", completedAt: new Date(), stepResults: [] },
    { playbookId: playbook2.id, triggeredBy: "automation:health-score-alert", outcome: "success", completedAt: new Date(), stepResults: [] },
  ]);

  // A hypothesis entity with evidence links, for /api/hypotheses coverage.
  const [hypothesis] = await db
    .insert(entities)
    .values({
      type: "hypothesis",
      name: "Shorter onboarding sequences generalize across lifecycle campaigns",
      summary: "Hypothesis that the trial-onboarding email shortening result generalizes to other lifecycle email sequences.",
    })
    .returning();
  idByKey.set("marketing.hypothesis", hypothesis.id);

  const marketingDecId = idByKey.get("marketing.dec")!;
  await db.insert(relations).values({
    fromEntityId: hypothesis.id,
    toEntityId: marketingDecId,
    relationType: "evidences",
    extractedBy: "llm-proposal",
    confidenceClass: "proposed",
    provenanceSource: "llm-extraction:cross-campaign-analysis",
    confidence: "0.5",
    notes: "Proposed generalization — pending a second campaign trial before confirmation.",
  });

  console.log(`Seeded 2 retrospectives, 2 playbooks (${runOutcomes.length + 2} runs), 1 hypothesis.`);
  console.log("Seed complete.");

  // Emit the key -> id map so the eval script can resolve queries by title
  // (titles are unique in this seed set, so eval resolves by title lookup
  // rather than depending on this map directly).
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
