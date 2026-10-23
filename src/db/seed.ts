// Seed data for Part 46 — a small org graph with known hop distances, a
// red-flag corpus of decisions (one seeded case per detector, plus one clean
// control decision), and the red-flag definition registry mirrored into the
// database for reference/UI use. Idempotent: truncates Part 46 + compat
// tables and reseeds from scratch every run.

import "dotenv/config";
import { db } from "@/db";
import {
  people,
  stakeholderEdges,
  decisions,
  ethicalRedFlagDefinitions,
  orgSettings,
  ethicalReviews,
  safeChannelReports,
  safeChannelAccessLog,
  safeChannelAlerts,
  safeChannelCaseEvents,
  antiRetaliationSignals,
  dualControlActions,
  dualControlApprovals,
  dualControlViolationAttempts,
  conflictDeclarations,
  conflictRecusals,
  conflictProximityWarnings,
  dissentSuggestions,
  dissentSuppressionAttempts,
  dissentArchiveRequests,
  auditLog,
} from "@/db/schema";
import { RED_FLAG_DEFINITIONS } from "@/lib/ethics/redFlags";
import { sql } from "drizzle-orm";

async function reset() {
  // Children first.
  await db.execute(sql`truncate table ${dissentArchiveRequests} restart identity cascade`);
  await db.execute(sql`truncate table ${dissentSuppressionAttempts} restart identity cascade`);
  await db.execute(sql`truncate table ${dissentSuggestions} restart identity cascade`);
  await db.execute(sql`truncate table ${conflictRecusals} restart identity cascade`);
  await db.execute(sql`truncate table ${conflictProximityWarnings} restart identity cascade`);
  await db.execute(sql`truncate table ${conflictDeclarations} restart identity cascade`);
  await db.execute(sql`truncate table ${dualControlViolationAttempts} restart identity cascade`);
  await db.execute(sql`truncate table ${dualControlApprovals} restart identity cascade`);
  await db.execute(sql`truncate table ${dualControlActions} restart identity cascade`);
  await db.execute(sql`truncate table ${antiRetaliationSignals} restart identity cascade`);
  await db.execute(sql`truncate table ${safeChannelCaseEvents} restart identity cascade`);
  await db.execute(sql`truncate table ${safeChannelAlerts} restart identity cascade`);
  await db.execute(sql`truncate table ${safeChannelAccessLog} restart identity cascade`);
  await db.execute(sql`truncate table ${safeChannelReports} restart identity cascade`);
  await db.execute(sql`truncate table ${ethicalReviews} restart identity cascade`);
  await db.execute(sql`truncate table ${ethicalRedFlagDefinitions} restart identity cascade`);
  await db.execute(sql`truncate table ${decisions} restart identity cascade`);
  await db.execute(sql`truncate table ${stakeholderEdges} restart identity cascade`);
  await db.execute(sql`truncate table ${people} restart identity cascade`);
  await db.execute(sql`truncate table ${orgSettings} restart identity cascade`);
  await db.execute(sql`truncate table ${auditLog} restart identity cascade`);
}

async function seedPeople() {
  const rows = await db
    .insert(people)
    .values([
      { name: "Casey CEO", email: "casey.ceo@leados.example", role: "ceo" },
      { name: "Vik VP-Eng", email: "vik.vpeng@leados.example", role: "manager" },
      { name: "Sana VP-Sales", email: "sana.vpsales@leados.example", role: "manager" },
      { name: "Mo Manager", email: "mo.manager@leados.example", role: "manager" },
      { name: "Ivy IC1", email: "ivy.ic1@leados.example", role: "employee" },
      { name: "Imran IC2", email: "imran.ic2@leados.example", role: "employee" },
      { name: "Priya HR", email: "priya.hr@leados.example", role: "hr_manager" },
      { name: "Eli EthicsOfficer", email: "eli.ethics@leados.example", role: "ethics_officer" },
      { name: "Oma Ombudsman", email: "oma.ombudsman@leados.example", role: "ombudsman" },
      { name: "Blair BoardLiaison", email: "blair.board@leados.example", role: "board_liaison" },
      { name: "Adrian Admin", email: "adrian.admin@leados.example", role: "admin" },
      { name: "Ira IC3", email: "ira.ic3@leados.example", role: "employee" },
    ])
    .returning();
  return rows;
}

async function seedEdges(p: Array<{ id: number; name: string }>) {
  const byName = Object.fromEntries(p.map((row) => [row.name, row.id]));
  await db.insert(stakeholderEdges).values([
    { fromPersonId: byName["Vik VP-Eng"], toPersonId: byName["Casey CEO"], relation: "reports_to" },
    { fromPersonId: byName["Sana VP-Sales"], toPersonId: byName["Casey CEO"], relation: "reports_to" },
    { fromPersonId: byName["Mo Manager"], toPersonId: byName["Vik VP-Eng"], relation: "reports_to" },
    { fromPersonId: byName["Ivy IC1"], toPersonId: byName["Mo Manager"], relation: "reports_to" },
    { fromPersonId: byName["Imran IC2"], toPersonId: byName["Mo Manager"], relation: "reports_to" },
    { fromPersonId: byName["Ira IC3"], toPersonId: byName["Mo Manager"], relation: "reports_to" },
    { fromPersonId: byName["Priya HR"], toPersonId: byName["Casey CEO"], relation: "reports_to" },
    { fromPersonId: byName["Eli EthicsOfficer"], toPersonId: byName["Casey CEO"], relation: "influences" },
    { fromPersonId: byName["Adrian Admin"], toPersonId: byName["Casey CEO"], relation: "reports_to" },
    { fromPersonId: byName["Oma Ombudsman"], toPersonId: byName["Blair BoardLiaison"], relation: "collaborates_with" },
  ]);
  return byName;
}

async function seedRedFlagDefinitions() {
  await db.insert(ethicalRedFlagDefinitions).values(
    RED_FLAG_DEFINITIONS.map((d) => ({
      code: d.code,
      label: d.label,
      description: d.description,
      severity: d.severity,
    })),
  );
}

async function seedOrgSettings() {
  await db.insert(orgSettings).values([
    { orgId: "default", key: "dual_control.approvers_required", value: 1 },
  ]);
}

async function seedDecisions(byName: Record<string, number>) {
  const rows = await db
    .insert(decisions)
    .values([
      {
        title: "Process performance scores from new monitoring tool",
        description: "Seeded corpus case: people-data decision with no subject visibility.",
        decisionType: "performance_data_processing",
        involvesPeopleData: true,
        subjectsHaveVisibility: false,
        visibilityScope: "individual",
        reversibility: "reversible",
        impact: "medium",
        isPowerAction: false,
        primarySubjectPersonId: byName["Ivy IC1"],
        proposedByPersonId: byName["Priya HR"],
        structuredCriteria: { dimension_a_score: 0.92, dimension_b_score: 0.48 },
      },
      {
        title: "Grant org-wide dashboard read access",
        description: "Seeded corpus case: bulk visibility grant.",
        decisionType: "access_grant",
        involvesPeopleData: true,
        subjectsHaveVisibility: true,
        visibilityScope: "bulk",
        reversibility: "reversible",
        impact: "medium",
        isPowerAction: false,
        proposedByPersonId: byName["Adrian Admin"],
      },
      {
        title: "Change performance evaluation policy weights",
        description: "Seeded corpus case: unilateral high-power (T4) action.",
        decisionType: "policy_change",
        involvesPeopleData: true,
        subjectsHaveVisibility: true,
        visibilityScope: "individual",
        reversibility: "partially_reversible",
        impact: "high",
        isPowerAction: true,
        powerActionType: "evaluation_policy_change",
        proposedByPersonId: byName["Casey CEO"],
      },
      {
        title: "Decommission legacy identity infrastructure",
        description: "Seeded corpus case: irreversible + high impact.",
        decisionType: "infrastructure_decommission",
        involvesPeopleData: false,
        subjectsHaveVisibility: true,
        visibilityScope: "individual",
        reversibility: "irreversible",
        impact: "high",
        isPowerAction: false,
        proposedByPersonId: byName["Vik VP-Eng"],
      },
      {
        title: "Ship accelerated product launch timeline",
        description: "Seeded corpus case: dissent hidden from the record.",
        decisionType: "product_launch",
        involvesPeopleData: false,
        subjectsHaveVisibility: true,
        visibilityScope: "individual",
        reversibility: "reversible",
        impact: "medium",
        isPowerAction: false,
        proposedByPersonId: byName["Mo Manager"],
        dissentNotes: [{ byPersonId: byName["Imran IC2"], note: "I disagree with this rollout timeline; QA window is too short." }],
        dissentHidden: true,
      },
      {
        title: "Promote Ivy IC1 to senior engineer",
        description: "Seeded corpus case: conflict-of-interest proximity scenario.",
        decisionType: "promotion_decision",
        involvesPeopleData: true,
        subjectsHaveVisibility: true,
        visibilityScope: "individual",
        reversibility: "partially_reversible",
        impact: "medium",
        isPowerAction: false,
        primarySubjectPersonId: byName["Ivy IC1"],
        proposedByPersonId: byName["Mo Manager"],
      },
      {
        title: "Rotate team standup time by 30 minutes",
        description: "Seeded corpus control case: expected to raise zero red flags.",
        decisionType: "scheduling",
        involvesPeopleData: false,
        subjectsHaveVisibility: true,
        visibilityScope: "individual",
        reversibility: "reversible",
        impact: "low",
        isPowerAction: false,
        proposedByPersonId: byName["Mo Manager"],
      },
    ])
    .returning();
  return rows;
}

async function main() {
  console.log("[seed] resetting Part 46 tables...");
  await reset();

  console.log("[seed] inserting people...");
  const peopleRows = await seedPeople();

  console.log("[seed] inserting stakeholder graph edges...");
  const byName = await seedEdges(peopleRows);

  console.log("[seed] inserting red-flag definitions + org settings...");
  await seedRedFlagDefinitions();
  await seedOrgSettings();

  console.log("[seed] inserting decision corpus...");
  const decisionRows = await seedDecisions(byName);

  console.log("[seed] done.");
  console.log(
    JSON.stringify(
      {
        people: Object.fromEntries(peopleRows.map((p) => [p.name, p.id])),
        decisions: Object.fromEntries(decisionRows.map((d) => [d.title, d.id])),
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
