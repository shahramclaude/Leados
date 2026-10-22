// =============================================================================
// LEADOS — Part 23 — Seed script for Decision Operations demo data
// =============================================================================
// Populates two seeded orgs with realistic, backdated decision data so the
// Decision Desk / Debt / Velocity / Quality Trends pages have something
// meaningful to show, and so `scripts/verify.ts` has seeded orgs to compute
// p50/p95 velocity tables and decision-debt detection against.
//
// NOTE: this script writes directly to the tables (bypassing the lifecycle
// functions in src/lib/decision/decisionEngine.ts) so it can backdate
// timestamps for realistic percentiles. The lifecycle functions themselves
// (and the frozen-record invariant) are exercised separately and freshly by
// scripts/verify.ts using the real API, not by this bulk seed.
// =============================================================================

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  orgs,
  users,
  decisions,
  decisionDissent,
  decisionStateTransitions,
  decisionRightsConfigs,
  decisionQualityScores,
  preMortems,
  decisionTriggerWatches,
  sensorSignalReadings,
  decisionJournalEntries,
  decisionCorrections,
  eventLog,
} from "../src/db/schema";
import { ensureDecisionInvariants } from "../src/lib/decision/dbSetup";

const DAY = 24 * 60 * 60 * 1000;
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

async function wipe() {
  // Truncate in FK-safe order (CASCADE handles children, but being explicit).
  await db.execute(sql.raw(`truncate table
    decision_corrections,
    decision_quality_scores,
    pre_mortems,
    decision_trigger_watches,
    decision_dissent,
    decision_state_transitions,
    decision_journal_entries,
    sensor_signal_readings,
    review_tasks,
    event_log,
    decisions,
    decision_rights_configs,
    users,
    orgs
    restart identity cascade`));
}

async function main() {
  console.log("Ensuring decision invariants (frozen-record trigger)...");
  await ensureDecisionInvariants();

  console.log("Wiping existing demo data...");
  await wipe();

  // --- Org 1: Acme Robotics ---------------------------------------------
  const [acme] = await db.insert(orgs).values({ name: "Acme Robotics" }).returning();

  const [priya, jordan, alex, sam, dana, noor] = await db
    .insert(users)
    .values([
      { orgId: acme.id, name: "Priya Shah", role: "eng_director" },
      { orgId: acme.id, name: "Jordan Lee", role: "cfo" },
      { orgId: acme.id, name: "Alex Kim", role: "ceo" },
      { orgId: acme.id, name: "Sam Osei", role: "ic" },
      { orgId: acme.id, name: "Dana Ruiz", role: "coo" },
      { orgId: acme.id, name: "Noor Patel", role: "hr" },
    ])
    .returning();

  await db.insert(decisionRightsConfigs).values([
    { orgId: acme.id, decisionClass: "pricing_change", deciderRole: "cfo", consultedRoles: ["ceo"], informedRoles: ["ic"] },
    { orgId: acme.id, decisionClass: "architecture", deciderRole: "eng_director", consultedRoles: ["ic"], informedRoles: ["cfo"] },
    { orgId: acme.id, decisionClass: "hiring", deciderRole: "eng_director", consultedRoles: ["hr"], informedRoles: ["cfo"] },
    { orgId: acme.id, decisionClass: "office_policy", deciderRole: "coo", consultedRoles: ["hr"], informedRoles: [] },
    // "vendor_contract" deliberately left unconfigured -> ambiguity finding
  ]);

  // Helper to insert a decision + matching state transitions in one go.
  async function seedDecision(opts: {
    orgId: string;
    decisionClass: string;
    question: string;
    decisionType: "type1" | "type2";
    impact: number;
    raisedBy: string | null;
    status: "raised" | "framed" | "evidence_gathered" | "decided" | "reviewed";
    timestamps: { raisedAt: Date; framedAt?: Date; evidenceGatheredAt?: Date; committedAt?: Date; reviewedAt?: Date };
    optionsConsidered?: string[];
    optionEvidence?: Record<string, unknown>;
    chosen?: string;
    choiceRationale?: string;
    dissentSnapshot?: unknown[];
    expectedOutcome?: string;
    expectedInterval?: unknown;
    confidenceClass?: "low" | "medium" | "high";
    reviewAt?: Date;
    decidedBy?: string | null;
    decisionRightsSnapshot?: unknown;
    reversibilityPlan?: string;
    triggerConditions?: { signal: string; op: string; value: number }[];
  }) {
    const [row] = await db
      .insert(decisions)
      .values({
        orgId: opts.orgId,
        decisionClass: opts.decisionClass,
        question: opts.question,
        decisionType: opts.decisionType,
        impact: opts.impact,
        raisedBy: opts.raisedBy,
        status: opts.status,
        raisedAt: opts.timestamps.raisedAt,
        framedAt: opts.timestamps.framedAt ?? null,
        evidenceGatheredAt: opts.timestamps.evidenceGatheredAt ?? null,
        committedAt: opts.timestamps.committedAt ?? null,
        reviewedAt: opts.timestamps.reviewedAt ?? null,
        optionsConsidered: opts.optionsConsidered ?? [],
        optionEvidence: opts.optionEvidence ?? {},
        chosen: opts.chosen ?? null,
        choiceRationale: opts.choiceRationale ?? null,
        dissentSnapshot: opts.dissentSnapshot ?? [],
        expectedOutcome: opts.expectedOutcome ?? null,
        expectedInterval: opts.expectedInterval ?? null,
        confidenceClass: opts.confidenceClass ?? null,
        reviewAt: opts.reviewAt ?? null,
        decidedBy: opts.decidedBy ?? null,
        decisionRightsSnapshot: opts.decisionRightsSnapshot ?? null,
        reversibilityPlan: opts.reversibilityPlan ?? null,
        triggerConditions: opts.triggerConditions ?? [],
      })
      .returning();

    const transitionSeq: { state: string; at: Date }[] = [{ state: "raised", at: opts.timestamps.raisedAt }];
    if (opts.timestamps.framedAt) transitionSeq.push({ state: "framed", at: opts.timestamps.framedAt });
    if (opts.timestamps.evidenceGatheredAt)
      transitionSeq.push({ state: "evidence_gathered", at: opts.timestamps.evidenceGatheredAt });
    if (opts.timestamps.committedAt) transitionSeq.push({ state: "decided", at: opts.timestamps.committedAt });
    if (opts.timestamps.reviewedAt) transitionSeq.push({ state: "reviewed", at: opts.timestamps.reviewedAt });

    for (let i = 0; i < transitionSeq.length; i++) {
      await db.insert(decisionStateTransitions).values({
        decisionId: row.id,
        fromState: i === 0 ? null : transitionSeq[i - 1].state,
        toState: transitionSeq[i].state,
        actorId: opts.raisedBy,
        createdAt: transitionSeq[i].at,
      });
    }

    await db.insert(eventLog).values({
      orgId: opts.orgId,
      entityType: "decision",
      entityId: row.id,
      type: "decision.seeded",
      payload: { question: opts.question, status: opts.status },
      createdAt: opts.timestamps.raisedAt,
    });

    return row;
  }

  const acmeRightsSnapshotFor = (role: string, consulted: string[] = [], informed: string[] = []) => ({
    role,
    consulted,
    informed,
  });

  // D1: reviewed, major, good DQ
  const d1 = await seedDecision({
    orgId: acme.id,
    decisionClass: "pricing_change",
    question: "Should we raise API prices by 12% for the enterprise tier?",
    decisionType: "type2",
    impact: 4,
    raisedBy: jordan.id,
    status: "reviewed",
    timestamps: {
      raisedAt: daysAgo(40),
      framedAt: daysAgo(38),
      evidenceGatheredAt: daysAgo(35),
      committedAt: daysAgo(30),
      reviewedAt: daysAgo(5),
    },
    optionsConsidered: ["Raise 12%", "Raise 5%", "No change"],
    optionEvidence: {
      "Raise 12%": { value: "Raise 12%", rationale: "Max revenue upside, modeled off competitor pricing", interval: { low: 8, high: 15, unit: "% ARR lift" }, confidence: "medium" },
      "Raise 5%": { value: "Raise 5%", rationale: "Conservative, matches inflation plus margin", interval: { low: 3, high: 6, unit: "% ARR lift" }, confidence: "high" },
      "No change": { value: "No change", rationale: "Avoid churn risk entirely", interval: { low: 0, high: 0, unit: "% ARR lift" }, confidence: "high" },
    },
    chosen: "Raise 5%",
    choiceRationale: "Balances revenue upside against enterprise churn risk flagged in dissent.",
    dissentSnapshot: [
      { who: sam.id, whoName: "Sam Osei", theCase: "12% is too aggressive; two of our top 5 accounts are price-sensitive this renewal cycle.", response: "Agreed — going with 5% and monitoring churn trigger." },
    ],
    expectedOutcome: "5% price increase with <2% enterprise logo churn over next 2 quarters.",
    expectedInterval: { low: 3, high: 6, unit: "% ARR lift" },
    confidenceClass: "high",
    reviewAt: daysAgo(2),
    decidedBy: jordan.id,
    decisionRightsSnapshot: acmeRightsSnapshotFor("cfo", ["ceo"], ["ic"]),
    reversibilityPlan: "Can roll back pricing for any account within 30 days of renewal notice at CS's discretion.",
    triggerConditions: [{ signal: "enterprise_churn_rate", op: "gt", value: 0.05 }],
  });

  await db.insert(decisionTriggerWatches).values({
    decisionId: d1.id,
    signal: "enterprise_churn_rate",
    thresholdOp: "gt",
    thresholdValue: "0.05",
    status: "watching",
  });

  await db.insert(preMortems).values({
    decisionId: d1.id,
    reasons: ["Enterprise churn spikes above model", "Sales team undersells the increase and loses deals"],
    mitigations: ["Grandfather top 10 accounts for one renewal cycle", "Sales enablement deck before rollout"],
    createdBy: jordan.id,
    createdAt: daysAgo(31),
  });

  // Two independent DQ scorings on D1 across different weeks (trend data +
  // also usable as a real example of close-but-not-identical rater scores).
  await db.insert(decisionQualityScores).values([
    { decisionId: d1.id, frame: 2, options: 2, evidence: 2, expectations: 2, reversibility: 1, review: 2, dq: 11, autoDq: 10, gamingRisk: false, scoredBy: "Jordan Lee", notes: { text: "Strong record, clean intervals on every option." }, createdAt: daysAgo(29) },
    { decisionId: d1.id, frame: 2, options: 2, evidence: 2, expectations: 2, reversibility: 2, review: 2, dq: 12, autoDq: 10, gamingRisk: false, scoredBy: "Alex Kim", notes: { text: "Reversibility plan is concrete (30-day rollback), rounding up." }, createdAt: daysAgo(4) },
  ]);

  // D2: decided (not yet reviewed), irreversible, unanswered dissent
  const d2 = await seedDecision({
    orgId: acme.id,
    decisionClass: "architecture",
    question: "Should we rebuild the recommendation engine on a new ML stack?",
    decisionType: "type1",
    impact: 5,
    raisedBy: priya.id,
    status: "decided",
    timestamps: { raisedAt: daysAgo(20), framedAt: daysAgo(18), evidenceGatheredAt: daysAgo(15), committedAt: daysAgo(10) },
    optionsConsidered: ["Rebuild on new stack", "Incrementally refactor", "Do nothing"],
    optionEvidence: {
      "Rebuild on new stack": { value: "Rebuild on new stack", rationale: "Unblocks real-time personalization roadmap", interval: { low: 150, high: 300, unit: "ms p95 latency" }, confidence: "low" },
      "Incrementally refactor": { value: "Incrementally refactor", rationale: "Lower risk, slower payoff", interval: { low: 250, high: 400, unit: "ms p95 latency" }, confidence: "medium" },
    },
    chosen: "Rebuild on new stack",
    choiceRationale: "Roadmap commitments require sub-300ms p95 inference; incremental path can't get there in time.",
    dissentSnapshot: [
      { who: dana.id, whoName: "Dana Ruiz", theCase: "This is a 6-month irreversible bet on a stack the team hasn't operated in production before.", response: null },
    ],
    expectedOutcome: "p95 inference latency under 300ms within one quarter of cutover.",
    expectedInterval: { low: 150, high: 300, unit: "ms" },
    confidenceClass: "low",
    reviewAt: daysFromNow(20),
    decidedBy: priya.id,
    decisionRightsSnapshot: acmeRightsSnapshotFor("eng_director", ["ic"], ["cfo"]),
    reversibilityPlan: "Keep old stack running in shadow mode for 60 days post-cutover before decommission.",
    triggerConditions: [{ signal: "inference_latency_ms", op: "gt", value: 300 }],
  });

  await db.insert(decisionTriggerWatches).values({
    decisionId: d2.id,
    signal: "inference_latency_ms",
    thresholdOp: "gt",
    thresholdValue: "300",
    status: "watching",
  });

  await db.insert(decisionQualityScores).values({
    decisionId: d2.id,
    frame: 2,
    options: 1,
    evidence: 1,
    expectations: 2,
    reversibility: 2,
    review: 1,
    dq: 9,
    autoDq: 9,
    gamingRisk: false,
    scoredBy: "Priya Shah",
    notes: { text: "Only 2 options meaningfully evidenced; dissent still unanswered." },
    createdAt: daysAgo(9),
  });

  // D3: framed, evidence gap (one option missing interval)
  await seedDecision({
    orgId: acme.id,
    decisionClass: "office_policy",
    question: "Should we open a Toronto engineering office?",
    decisionType: "type1",
    impact: 4,
    raisedBy: dana.id,
    status: "framed",
    timestamps: { raisedAt: daysAgo(8), framedAt: daysAgo(6) },
    optionsConsidered: ["Open Toronto office", "Stay fully remote", "Open Austin office instead"],
    optionEvidence: {
      "Open Toronto office": { value: "Open Toronto office", rationale: "Deep talent pool, favorable R&D tax credit", interval: { low: 400000, high: 900000, unit: "USD/yr cost" }, confidence: "medium" },
      "Stay fully remote": { value: "Stay fully remote", rationale: "No new fixed cost, slower in-person collaboration" },
    },
    reversibilityPlan: "Lease break clause at 18 months.",
  });

  // D4: open (framed) decision with an already-breached trigger -> decision debt
  await seedDecision({
    orgId: acme.id,
    decisionClass: "vendor_contract", // deliberately unconfigured decider -> ambiguity
    question: "Should we switch cloud providers to reduce infra cost?",
    decisionType: "type2",
    impact: 3,
    raisedBy: priya.id,
    status: "framed",
    timestamps: { raisedAt: daysAgo(15), framedAt: daysAgo(12) },
    optionsConsidered: ["Switch to Provider B", "Negotiate current contract", "Do nothing"],
    triggerConditions: [{ signal: "cloud_spend_monthly_usd", op: "gt", value: 50000 }],
  });

  // D5: evidence_gathered, in progress
  await seedDecision({
    orgId: acme.id,
    decisionClass: "hiring",
    question: "Should we hire 3 more backend engineers this quarter?",
    decisionType: "type2",
    impact: 3,
    raisedBy: priya.id,
    status: "evidence_gathered",
    timestamps: { raisedAt: daysAgo(5), framedAt: daysAgo(4), evidenceGatheredAt: daysAgo(2) },
    optionsConsidered: ["Hire 3 now", "Hire 1 now, revisit next quarter", "Contract instead"],
    optionEvidence: {
      "Hire 3 now": { value: "Hire 3 now", rationale: "Backlog growing faster than team capacity", interval: { low: 2, high: 4, unit: "sprints of backlog relief" }, confidence: "medium" },
      "Hire 1 now, revisit next quarter": { value: "Hire 1 now, revisit next quarter", rationale: "Hedge against a Q3 slowdown", interval: { low: 1, high: 2, unit: "sprints of backlog relief" }, confidence: "medium" },
      "Contract instead": { value: "Contract instead", rationale: "Faster ramp but higher unit cost", interval: { low: 1, high: 3, unit: "sprints of backlog relief" }, confidence: "low" },
    },
  });

  // D6: decided, with a late correction (outcome note) — honesty-rule demo
  const d6 = await seedDecision({
    orgId: acme.id,
    decisionClass: "architecture",
    question: "Should we deprecate the v1 mobile app?",
    decisionType: "type2",
    impact: 3,
    raisedBy: priya.id,
    status: "decided",
    timestamps: { raisedAt: daysAgo(25), framedAt: daysAgo(23), evidenceGatheredAt: daysAgo(20), committedAt: daysAgo(18) },
    optionsConsidered: ["Deprecate v1 now", "Support v1 for 6 more months"],
    optionEvidence: {
      "Deprecate v1 now": { value: "Deprecate v1 now", rationale: "v1 is 4% of DAU and blocking the v3 release", interval: { low: 2, high: 5, unit: "% DAU impacted" }, confidence: "high" },
      "Support v1 for 6 more months": { value: "Support v1 for 6 more months", rationale: "Reduces support ticket spike", interval: { low: 0, high: 1, unit: "% DAU impacted" }, confidence: "medium" },
    },
    chosen: "Deprecate v1 now",
    choiceRationale: "v1 usage is low enough that the v3 unblock outweighs support cost.",
    expectedOutcome: "Support ticket volume increases less than 10% after deprecation.",
    expectedInterval: { low: 0, high: 10, unit: "% ticket volume" },
    confidenceClass: "medium",
    reviewAt: daysAgo(1),
    decidedBy: priya.id,
    decisionRightsSnapshot: acmeRightsSnapshotFor("eng_director", ["ic"], ["cfo"]),
    reversibilityPlan: "Keep v1 API read-only for 90 days before full shutdown.",
  });

  await db.insert(decisionCorrections).values({
    decisionId: d6.id,
    correctionType: "outcome_note",
    note: "Support ticket volume actually rose 14% in week 1, slightly above the expected interval — flagged for the upcoming review, not used to rewrite the original rationale.",
    payload: { actualTicketIncreasePct: 14 },
    createdAt: daysAgo(3),
  });

  await db.insert(decisionQualityScores).values({
    decisionId: d6.id,
    frame: 2,
    options: 1,
    evidence: 2,
    expectations: 2,
    reversibility: 1,
    review: 1,
    dq: 9,
    autoDq: 9,
    gamingRisk: false,
    scoredBy: "Priya Shah",
    notes: { text: "" },
    createdAt: daysAgo(17),
  });

  // Sensor signal readings (Part 13 stub seam) -> breach D4 (decision debt)
  await db.insert(sensorSignalReadings).values([
    { orgId: acme.id, signal: "cloud_spend_monthly_usd", value: "62000", observedAt: daysAgo(1) },
    { orgId: acme.id, signal: "enterprise_churn_rate", value: "0.02", observedAt: daysAgo(1) },
  ]);

  // Journal entries
  await db.insert(decisionJournalEntries).values([
    { orgId: acme.id, decisionId: d1.id, userId: jordan.id, whatIDecided: "Raised enterprise pricing by 5% instead of 12%.", whatIExpected: "Revenue lift with minimal churn.", whatHappened: "Churn stayed under 1.5% through the first renewal wave.", whatILearned: "Dissent from CS caught a real risk — worth the slower rollout.", createdAt: daysAgo(4) },
    { orgId: acme.id, decisionId: d2.id, userId: priya.id, whatIDecided: "Committed to rebuilding the recommendation engine on the new ML stack.", whatIExpected: "Sub-300ms p95 latency within a quarter.", whatHappened: null, whatILearned: null, createdAt: daysAgo(9) },
  ]);

  // --- Org 2: Lumen Health -------------------------------------------------
  const [lumen] = await db.insert(orgs).values({ name: "Lumen Health" }).returning();
  const [maria, ben] = await db
    .insert(users)
    .values([
      { orgId: lumen.id, name: "Maria Gonzalez", role: "medical_director" },
      { orgId: lumen.id, name: "Ben Carter", role: "ops_lead" },
    ])
    .returning();

  // No decision_rights_configs for Lumen at all -> every class is ambiguous.
  const u1 = await seedDecision({
    orgId: lumen.id,
    decisionClass: "office_policy",
    question: "Should we pilot a 4-day work week for non-clinical staff?",
    decisionType: "type2",
    impact: 3,
    raisedBy: ben.id,
    status: "raised",
    timestamps: { raisedAt: daysAgo(2) },
  });

  const u2 = await seedDecision({
    orgId: lumen.id,
    decisionClass: "vendor_contract",
    question: "Should we switch electronic health record (EHR) vendors?",
    decisionType: "type1",
    impact: 5,
    raisedBy: maria.id,
    status: "decided",
    timestamps: { raisedAt: daysAgo(50), framedAt: daysAgo(45), evidenceGatheredAt: daysAgo(40), committedAt: daysAgo(35) },
    optionsConsidered: ["Switch to Vendor X", "Stay on current vendor"],
    optionEvidence: {
      "Switch to Vendor X": { value: "Switch to Vendor X", rationale: "Better interoperability", confidence: "low" },
    },
    chosen: "Switch to Vendor X",
    choiceRationale: "Interoperability need outweighs migration pain.",
    expectedOutcome: "Fewer manual data re-entry incidents.",
    confidenceClass: "low",
    reviewAt: daysFromNow(30),
    decidedBy: maria.id,
    decisionRightsSnapshot: { role: null, consulted: [], informed: [] },
    dissentSnapshot: [{ who: ben.id, whoName: "Ben Carter", theCase: "Migration risk during flu season is too high.", response: "Noted, but delaying further risks the interoperability penalty deadline." }],
  });

  await db.insert(decisionQualityScores).values({
    decisionId: u2.id,
    frame: 1,
    options: 1,
    evidence: 0,
    expectations: 1,
    reversibility: 0,
    review: 1,
    dq: 4,
    autoDq: 3,
    gamingRisk: false,
    scoredBy: "Ben Carter",
    notes: { text: "No interval on the one option that has evidence; no reversibility plan for a type1 call." },
    createdAt: daysAgo(34),
  });

  console.log("Seed complete.");
  console.log(JSON.stringify({ acmeOrgId: acme.id, lumenOrgId: lumen.id, d1: d1.id, d2: d2.id, d6: d6.id, u2: u2.id }, null, 2));
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
