// src/lib/seedDemoData.ts
//
// Deterministic, idempotent demo data so the knowledge graph, institutional
// memory, hypotheses, playbooks and search index all have something real to
// show (and so tests have a fixed fixture to assert precision/recall
// against). Safe to call multiple times — every insert is keyed and guarded.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hypotheses, metrics, metricValues, playbooks, retrospectives } from "@/db/schema";
import { upsertEntity, upsertRelation } from "@/lib/knowledgeGraph";
import { recordRetrospective } from "@/lib/institutionalMemory";
import { registerHypothesis, addEvidence, resolveHypothesis } from "@/lib/hypotheses";
import { acceptCandidate, refreshPlaybookCandidates } from "@/lib/playbooksIntelligence";
import { refreshGraphScores } from "@/lib/search";
import { ensureWhitepaper } from "@/lib/docs";

export async function seedDemoData() {
  // --- Entities ---------------------------------------------------------
  await upsertEntity({ key: "person:amelia", type: "person", name: "Amelia Chen", description: "VP Product" });
  await upsertEntity({ key: "person:devon", type: "person", name: "Devon Okafor", description: "Head of Platform Eng" });
  await upsertEntity({ key: "project:checkout-revamp", type: "project", name: "Checkout Revamp" });
  await upsertEntity({ key: "project:onboarding-v2", type: "project", name: "Onboarding V2" });
  await upsertEntity({ key: "decision:skip-qa-gate", type: "decision", name: "Skip the pre-release QA gate for Checkout Revamp" });
  await upsertEntity({ key: "risk:vendor-outage", type: "risk", name: "Payments vendor outage risk" });
  await upsertEntity({ key: "metric:checkout-conversion", type: "metric", name: "Checkout conversion rate" });

  // --- Relations (knowledge graph) --------------------------------------
  await upsertRelation({ fromKey: "person:amelia", toKey: "project:checkout-revamp", type: "owns", weight: 1 });
  await upsertRelation({ fromKey: "person:devon", toKey: "project:onboarding-v2", type: "owns", weight: 1 });
  await upsertRelation({ fromKey: "decision:skip-qa-gate", toKey: "project:checkout-revamp", type: "caused", weight: 2 });
  await upsertRelation({ fromKey: "risk:vendor-outage", toKey: "project:checkout-revamp", type: "blocked", weight: 1 });
  await upsertRelation({ fromKey: "project:checkout-revamp", toKey: "metric:checkout-conversion", type: "informs", weight: 1 });
  // Intentionally leave "project:onboarding-v2" otherwise unconnected downstream so orphan detection has something besides the fully isolated node below to reason about.
  await upsertEntity({ key: "playbook:none-yet", type: "playbook", name: "Unused placeholder playbook entity" });
  // ^ deliberately orphaned (no relations) to exercise orphan detection in tests/UI.

  // --- Institutional memory: retrospectives -----------------------------
  const existingRetro = await db.select().from(retrospectives).where(eq(retrospectives.title, "Checkout Revamp shipped with a skipped QA gate")).limit(1);
  let seedRetroId: number;
  if (existingRetro.length > 0) {
    seedRetroId = existingRetro[0].id;
  } else {
    const retro1 = await recordRetrospective({
      title: "Checkout Revamp shipped with a skipped QA gate",
      situation: "Checkout Revamp was behind schedule ahead of a marketing deadline.",
      decision: "Leadership approved skipping the pre-release QA gate to hit the date.",
      outcome: "A payment-rounding bug reached production and caused a 4-hour incident.",
      lesson: "Never skip the pre-release QA gate for payment-path changes, regardless of deadline pressure.",
      playbookUpdate: "Require a mandatory QA gate sign-off before any payment-path release.",
      tags: ["qa-gate", "payments", "release-process"],
      outcomeValence: "negative",
      occurredAt: "2025-11-03",
    });
    seedRetroId = retro1.id;
    const retro2 = await recordRetrospective({
      title: "Onboarding V2 also shipped a payment-path change without full QA",
      situation: "Onboarding V2 included a billing-plan selector change near a release freeze.",
      decision: "Team shipped without the full QA gate to make the freeze window.",
      outcome: "Minor billing-plan mismatch required a same-day hotfix.",
      lesson: "A second team independently skipped the QA gate on a payment-path change under time pressure.",
      playbookUpdate: "Require a mandatory QA gate sign-off before any payment-path release.",
      tags: ["qa-gate", "payments", "release-process"],
      outcomeValence: "negative",
      occurredAt: "2025-12-10",
    });
    await recordRetrospective({
      title: "Org network reshuffle improved cross-team review latency",
      situation: "Code review latency between Platform and Product teams was over 2 days.",
      decision: "Rotated two reviewers across teams for a quarter.",
      outcome: "Median review latency dropped to 6 hours.",
      lesson: "Cross-team reviewer rotation reliably reduces review latency.",
      tags: ["org-design", "review-latency"],
      outcomeValence: "positive",
      occurredAt: "2026-01-05",
    });
  }

  // --- Playbook candidate mined from the retrospectives above, then accepted -> invocable playbook
  const existingPlaybook = await db.select().from(playbooks).where(eq(playbooks.key, "playbook:mandatory-qa-gate")).limit(1);
  if (existingPlaybook.length === 0) {
    const mined = await refreshPlaybookCandidates();
    const qaGateCandidate = mined.find((c) => c.suggestedTitle.toLowerCase().includes("qa gate"));
    if (qaGateCandidate) {
      await acceptCandidate(qaGateCandidate.id, "playbook:mandatory-qa-gate");
    }
  }

  // --- Hypotheses ---------------------------------------------------------
  const existingHyp = await db.select().from(hypotheses).where(eq(hypotheses.key, "hyp:qa-gate-reduces-incidents")).limit(1);
  if (existingHyp.length === 0) {
    const hyp = await registerHypothesis({
      key: "hyp:qa-gate-reduces-incidents",
      title: "Mandatory QA gate will cut payment-path incidents by 50% next quarter",
      description: "Betting that enforcing the new playbook measurably reduces incident count.",
      ownerName: "Amelia Chen",
      category: "release-process",
      priorProbability: 0.55,
    });
    await addEvidence({
      hypothesisId: hyp.id,
      description: "Two independent incidents both trace back to the same skipped gate.",
      direction: "supports",
      likelihoodRatio: 2.2,
      source: "retrospective pattern",
    });
    const hyp2 = await registerHypothesis({
      key: "hyp:onboarding-v2-adoption",
      title: "Onboarding V2 will lift activation rate above 60%",
      ownerName: "Devon Okafor",
      category: "product",
      priorProbability: 0.4,
      resolutionDate: "2026-02-01",
    });
    await addEvidence({
      hypothesisId: hyp2.id,
      description: "Early cohort activation came in at 41%, below target pace.",
      direction: "against",
      likelihoodRatio: 0.6,
      source: "cohort-analytics",
    });
    await resolveHypothesis(hyp2.id, false);
  }

  // --- Metrics --------------------------------------------------------
  async function ensureMetric(key: string, label: string, unit: string, value: number) {
    await db.insert(metrics).values({ key, label, unit }).onConflictDoNothing({ target: metrics.key });
    await db.insert(metricValues).values({ metricKey: key, value });
  }
  await ensureMetric("decision_velocity_per_month", "Decisions recorded per month", "decisions", 3);
  await ensureMetric("playbook_adoption_rate", "Playbook adoption rate", "%", 0.67);
  await ensureMetric("checkout_conversion", "Checkout conversion rate", "%", 0.312);

  await refreshGraphScores();
  await ensureWhitepaper(seedRetroId);

  return { seedRetroId };
}
