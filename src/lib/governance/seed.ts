// Demo/test data seeding for Part 55. Idempotent-ish: clears governance
// tables and reseeds a small, realistic board so the verification script
// and the UI have consistent fixtures.

import { db } from "@/db";
import {
  users,
  committees,
  committeeMembers,
  boardCalendar,
  boardMeetings,
  boardPacks,
  packSections,
  packRedFlags,
  preReadTracking,
  agendaItems,
  resolutions,
  resolutionVotes,
  tasks,
  resolutionImplementationLinks,
  oversightMilestones,
  effectivenessReviews,
  minutes,
  informationRequests,
  whistleblowerReports,
  conflictsRegister,
  auditLog,
  governancePolicy,
  completenessPolicy,
} from "@/db/schema";
import { seedDefaultCompletenessPolicy } from "./packAssembly";

export async function resetGovernanceData() {
  // Delete children before parents to respect logical FKs (no DB-level FKs
  // are declared, so order matters only for cleanliness).
  await db.delete(effectivenessReviews);
  await db.delete(oversightMilestones);
  await db.delete(resolutionImplementationLinks);
  await db.delete(tasks);
  await db.delete(resolutionVotes);
  await db.delete(resolutions);
  await db.delete(agendaItems);
  await db.delete(preReadTracking);
  await db.delete(packRedFlags);
  await db.delete(packSections);
  await db.delete(boardPacks);
  await db.delete(boardMeetings);
  await db.delete(boardCalendar);
  await db.delete(minutes);
  await db.delete(informationRequests);
  await db.delete(whistleblowerReports);
  await db.delete(conflictsRegister);
  await db.delete(auditLog);
  await db.delete(governancePolicy);
  await db.delete(completenessPolicy);
  await db.delete(committeeMembers);
  await db.delete(committees);
  await db.delete(users);
}

export async function seedBoard() {
  const insertedUsers = await db
    .insert(users)
    .values([
      { name: "Amara Okafor", email: "chair@leados.example", boardTier: "chair" },
      { name: "Priya Natarajan", email: "cosec@leados.example", boardTier: "company_secretary" },
      { name: "David Lindqvist", email: "director.david@leados.example", boardTier: "director" },
      { name: "Helena Cruz", email: "director.helena@leados.example", boardTier: "director" },
      { name: "Ravi Kapoor", email: "audit.chair@leados.example", boardTier: "audit_committee_chair" },
      { name: "Noa Berger", email: "audit.member@leados.example", boardTier: "audit_committee" },
      { name: "Oliver Mensah", email: "risk@leados.example", boardTier: "risk_committee" },
      { name: "Lena Fischer", email: "comp@leados.example", boardTier: "compensation_committee" },
      { name: "CFO Office", email: "cfo@leados.example", boardTier: "management" },
      { name: "External Audit LLP", email: "auditor@leados.example", boardTier: "external_auditor" },
      { name: "Shareholder Observer", email: "observer@leados.example", boardTier: "observer" },
    ])
    .returning();

  const byEmail = Object.fromEntries(insertedUsers.map((u) => [u.email, u]));

  const insertedCommittees = await db
    .insert(committees)
    .values([
      { slug: "audit", name: "Audit Committee", scopeDescription: "Financial reporting, controls, external audit, whistleblower channel." },
      { slug: "risk", name: "Risk Committee", scopeDescription: "Principal risk register, risk appetite, obligations tracking." },
      { slug: "compensation", name: "Compensation Committee", scopeDescription: "Executive remuneration and incentive design." },
    ])
    .returning();

  const auditCommittee = insertedCommittees.find((c) => c.slug === "audit")!;
  const riskCommittee = insertedCommittees.find((c) => c.slug === "risk")!;
  const compCommittee = insertedCommittees.find((c) => c.slug === "compensation")!;

  await db.insert(committeeMembers).values([
    { committeeId: auditCommittee.id, userId: byEmail["audit.chair@leados.example"].id, roleInCommittee: "chair" },
    { committeeId: auditCommittee.id, userId: byEmail["audit.member@leados.example"].id, roleInCommittee: "member" },
    { committeeId: riskCommittee.id, userId: byEmail["risk@leados.example"].id, roleInCommittee: "chair" },
    { committeeId: compCommittee.id, userId: byEmail["comp@leados.example"].id, roleInCommittee: "chair" },
  ]);

  await seedDefaultCompletenessPolicy("main_board");

  await db.insert(governancePolicy).values({
    key: "individual_director_scoring_enabled",
    value: false,
    documentedBy: "Board resolution 2026-Q1-GOV-01 (not adopted)",
    rationale:
      "Board has not adopted individual director performance scoring via this platform. Metrics remain board-level aggregates only, consistent with directors' collective fiduciary standing.",
  });

  return { users: insertedUsers, committees: insertedCommittees, byEmail };
}
