// LEADOS — Part 56: database seeding for the accountability module.
// Idempotent: truncates the accountability tables and reseeds from the
// canonical REGISTRY plus demo people/monitoring/fairness/assessment/
// decision data used by the console pages and the verification scripts.
import { db } from "@/db";
import {
  algoSystems,
  auditChainEntries,
  contestations,
  decisionRecords,
  explanations,
  fairnessReports,
  impactAssessments,
  modelCards,
  monitoringChecks,
  optOuts,
  people,
} from "@/db/schema";
import { REGISTRY } from "./registry";
import { PEOPLE } from "./people";
import { mapActionTierToRegulatoryTier } from "./riskTiers";
import { appendAuditEntry } from "./auditChain";
import { createAssessmentDraft, approveAssessment, submitForReview } from "./assessments";
import { recordDecision, confirmHumanReview, fileContestation, resolveContestation, requestOptOut } from "./rights";

export async function resetAccountabilityTables() {
  await db.delete(contestations);
  await db.delete(explanations);
  await db.delete(decisionRecords);
  await db.delete(optOuts);
  await db.delete(impactAssessments);
  await db.delete(auditChainEntries);
  await db.delete(fairnessReports);
  await db.delete(monitoringChecks);
  await db.delete(modelCards);
  await db.delete(algoSystems);
  await db.delete(people);
}

export async function seedDatabase() {
  await resetAccountabilityTables();

  await db.insert(people).values(PEOPLE.map((p) => ({ personKey: p.personKey, name: p.name, role: p.role, note: p.note })));

  for (const def of REGISTRY) {
    const regulatoryTier = mapActionTierToRegulatoryTier(def.actionTier);
    await db.insert(algoSystems).values({
      systemKey: def.id,
      name: def.name,
      purpose: def.purpose,
      affectedParties: def.affectedParties,
      inputs: def.inputs,
      outputs: def.outputs,
      decisionRole: def.decisionRole,
      actionTier: def.actionTier,
      regulatoryTier,
      sourceModule: def.sourceModule,
      owner: def.owner,
      oversightOwner: def.humanOversight.owner,
      oversightMethod: def.humanOversight.method,
      oversightTrainingNotes: def.humanOversight.trainingNotes,
      optOutAllowed: def.optOutPolicy.allowed,
      optOutLimits: def.optOutPolicy.limits,
      requiresHumanReview: def.decisionRole === "automate" && def.actionTier === "T4",
    });

    await db.insert(modelCards).values({
      systemKey: def.id,
      name: def.modelCardSeed.name,
      version: def.modelCardSeed.version,
      summary: def.modelCardSeed.summary,
      trainingData: def.modelCardSeed.trainingData,
      limitations: def.modelCardSeed.limitations,
      metrics: def.modelCardSeed.metrics,
    });

    await appendAuditEntry({
      systemKey: def.id,
      actorId: "system-seed",
      action: "system_registered",
      payload: { owner: def.owner, actionTier: def.actionTier, decisionRole: def.decisionRole },
    });

    // Initial, already-approved impact assessment for every system.
    const draft = await createAssessmentDraft({
      systemKey: def.id,
      purpose: def.purpose,
      proportionality: `Automation level (${def.decisionRole}) is proportionate to action tier ${def.actionTier}: ${
        def.decisionRole === "automate"
          ? "mandatory human review gate applies before any consequence is final."
          : "a human remains the acting decision-maker."
      }`,
      affectedPartiesText: `Primarily affects ${def.affectedParties}. ${def.optOutPolicy.limits}`,
      risksToRights: `Key risk: erroneous ${def.outputs[0]} affecting an individual's ${
        def.affectedParties === "workers" ? "income or standing on the platform" : "service experience"
      }. Mitigated via explanation + contestation rights below.`,
      dataGovernance: `Inputs limited to: ${def.inputs.join(", ")}. No inputs outside declared registry scope are used.`,
      humanOversightText: `${def.humanOversight.method} Training: ${def.humanOversight.trainingNotes}`,
      accuracyRobustness: `See model card ${def.modelCardSeed.name} v${def.modelCardSeed.version}: ${def.modelCardSeed.limitations}`,
      transparencyText: `Subjects can view the decision, explanation and factors in "My Automated Decisions", and contest it.`,
      linkedExperimentIds: [],
      triggeredBy: "initial",
      actorId: "system-seed",
    });
    await submitForReview(draft.id, "system-seed");
    await approveAssessment(draft.id, "rev-001", "reviewer");
  }

  // --- Monitoring checks (Part 38 stand-in) -------------------------------
  await db.insert(monitoringChecks).values([
    {
      checkId: "mon-eligibility-drift-01",
      systemKey: "eligibility-scoring-v1",
      checkType: "drift",
      status: "pass",
      details: { populationStabilityIndex: 0.04, threshold: 0.1 },
    },
    {
      checkId: "mon-match-exposure-01",
      systemKey: "candidate-match-recommender-v2",
      checkType: "fairness",
      status: "pass",
      details: { exposureGini: 0.21, threshold: 0.3 },
    },
    {
      checkId: "mon-perf-accuracy-01",
      systemKey: "performance-risk-predictor-v1",
      checkType: "accuracy",
      status: "fail",
      details: {
        liveAUC: 0.63,
        backtestAUC: 0.74,
        note: "Live accuracy has drifted 0.11 below backtest; reassessment overdue.",
      },
    },
    {
      checkId: "mon-fraud-fairness-01",
      systemKey: "fraud-anomaly-flagger-v1",
      checkType: "fairness",
      status: "warn",
      details: { tenureHoldRateDisparity: 1.42, threshold: 1.25 },
    },
    {
      checkId: "mon-fraud-availability-01",
      systemKey: "fraud-anomaly-flagger-v1",
      checkType: "availability",
      status: "pass",
      details: { uptime30d: 0.9993 },
    },
    {
      checkId: "mon-support-triage-01",
      systemKey: "support-ticket-priority-scorer-v1",
      checkType: "accuracy",
      status: "pass",
      details: { agreementWithHumanAudit: 0.86, threshold: 0.75 },
    },
  ]);

  // --- Fairness reports (Part 09 stand-in) --------------------------------
  await db.insert(fairnessReports).values([
    {
      systemKey: "fraud-anomaly-flagger-v1",
      metric: "hold_rate_parity_by_tenure",
      groupA: "tenure < 6 months",
      groupB: "tenure >= 6 months",
      valueA: 0.17,
      valueB: 0.12,
      disparityRatio: 1.42,
      threshold: 1.25,
      passed: false,
    },
    {
      systemKey: "candidate-match-recommender-v2",
      metric: "exposure_parity_by_region_density",
      groupA: "low-density region",
      groupB: "high-density region",
      valueA: 0.31,
      valueB: 0.36,
      disparityRatio: 1.16,
      threshold: 1.25,
      passed: true,
    },
    {
      systemKey: "eligibility-scoring-v1",
      metric: "upgrade_rate_parity_by_tenure_gap",
      groupA: "has tenure gap (e.g. leave)",
      groupB: "no tenure gap",
      valueA: 0.22,
      valueB: 0.27,
      disparityRatio: 1.23,
      threshold: 1.25,
      passed: true,
    },
  ]);

  // --- Rights machinery demo data -----------------------------------------
  const eligibilityDecision = await recordDecision({
    systemKey: "eligibility-scoring-v1",
    subjectId: "subj-001",
    outputSummary: { eligibilityScore: 78, tierRecommendation: "premium" },
    explanationSummary:
      "Aria was recommended for the premium tier mainly because of a high on-time rate and a strong completed-jobs count, slightly offset by a nonzero dispute rate.",
    factors: [
      { factor: "Completed jobs", weight: 32, direction: "increases" },
      { factor: "On-time rate", weight: 31, direction: "increases" },
      { factor: "Verified credentials", weight: 16, direction: "increases" },
      { factor: "Dispute rate", weight: 9, direction: "decreases" },
    ],
    actorId: "system-seed",
  });

  const matchDecision = await recordDecision({
    systemKey: "candidate-match-recommender-v2",
    subjectId: "subj-001",
    outputSummary: { matchScore: 81, rank: 3, jobId: "job-4471" },
    explanationSummary: "Aria ranked #3 for job-4471 due to strong skill match and good proximity.",
    factors: [
      { factor: "Skill match", weight: 38, direction: "increases" },
      { factor: "Proximity", weight: 18, direction: "increases" },
      { factor: "Past rating", weight: 17, direction: "increases" },
      { factor: "Availability", weight: 8, direction: "increases" },
    ],
    actorId: "system-seed",
  });

  const fraudDecision = await recordDecision({
    systemKey: "fraud-anomaly-flagger-v1",
    subjectId: "subj-002",
    outputSummary: { riskScore: 68, holdAction: "temporary_hold", reasonCodes: ["HIGH_PAYOUT_VELOCITY", "DEVICE_CHANGE"] },
    explanationSummary:
      "Ben's payout was automatically held because of unusually high payout velocity combined with a recent device fingerprint change.",
    factors: [
      { factor: "Payout velocity", weight: 36, direction: "increases" },
      { factor: "Device fingerprint change", weight: 20, direction: "increases" },
      { factor: "Geo-velocity anomaly", weight: 0, direction: "increases" },
      { factor: "Prior disputes", weight: 0, direction: "increases" },
    ],
    actorId: "system-seed",
  });

  const ticketDecision = await recordDecision({
    systemKey: "support-ticket-priority-scorer-v1",
    subjectId: "cust-001",
    outputSummary: { priorityScore: 28, suggestedOrder: "standard", ticketId: "tix-9981" },
    explanationSummary: "Dana's ticket was ordered as standard priority: no severity keywords matched and SLA time remaining was ample.",
    factors: [
      { factor: "Severity keywords", weight: 0, direction: "increases" },
      { factor: "Customer tier", weight: 10, direction: "increases" },
      { factor: "SLA time remaining", weight: 4, direction: "increases" },
      { factor: "Reopened count", weight: 0, direction: "increases" },
    ],
    actorId: "system-seed",
  });

  // Ben contests the automated hold; still open under review.
  const contestation = await fileContestation({
    decisionRecordId: fraudDecision.decision.id,
    subjectId: "subj-002",
    reason: "I changed phones last week after mine broke — this is not fraud, please release my payout.",
  });
  await resolveContestation({
    contestationId: contestation.id,
    requester: { personKey: "aud-001", role: "auditor" },
    status: "under_review",
    resolutionNotes: "Escalated to Trust & Safety duty reviewer for the mandatory 24h review window.",
  });

  // Ben's hold has NOT yet had its mandatory human review completed —
  // deliberately left "pending" to exercise the oversight-queue UI honestly.
  void confirmHumanReview; // referenced for future duty-reviewer action from the console

  // Dana opts out of priority scoring (allowed).
  await requestOptOut({ systemKey: "support-ticket-priority-scorer-v1", subjectId: "cust-001", scope: "all_tickets" });
  // Ben attempts to opt out of fraud controls (not allowed — documented limit).
  await requestOptOut({ systemKey: "fraud-anomaly-flagger-v1", subjectId: "subj-002", scope: "all_payouts" });

  return {
    systemsSeeded: REGISTRY.length,
    peopleSeeded: PEOPLE.length,
    decisionsSeeded: [eligibilityDecision, matchDecision, fraudDecision, ticketDecision].length,
  };
}
