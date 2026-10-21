import { createTeam, listTeamsByOrg, upsertOnboardingState } from "@/db/repositories/orgs";
import { createSubject, deleteSampleSubjects } from "@/db/repositories/subjects";
import {
  createBriefing,
  createFinding,
  createPlaybook,
  deleteSampleEngineContent,
} from "@/db/repositories/engineContent";

/**
 * Synthetic sample data (Section E). Every row this creates sets
 * `isSample: true`, which the UI renders with a visible "Sample data" badge
 * (never indistinguishable from real data) and which
 * `removeSampleDataForOrg` deletes in one pass — a true one-click undo.
 */
export async function seedSampleDataForOrg(orgId: string) {
  const existingTeams = await listTeamsByOrg(orgId);
  const team =
    existingTeams[0] ??
    (await createTeam(orgId, "Sample Team"));

  const people = [
    { name: "Freja Holm", roleTitle: "Senior Engineer", riskScore: 82 },
    { name: "Lars Nielsen", roleTitle: "Customer Success Lead", riskScore: 61 },
    { name: "Mette Jensen", roleTitle: "Product Manager", riskScore: 35 },
  ];

  const createdSubjects = [];
  for (const person of people) {
    const subject = await createSubject(orgId, { ...person, teamId: team.id, isSample: true });
    createdSubjects.push(subject);
  }

  await createBriefing(orgId, {
    templateKey: "engine.briefing.attritionRisk",
    params: { name: createdSubjects[0].name, level: "high", reasonCount: 3, period: "quarter" },
    severity: "urgent",
    subjectId: createdSubjects[0].id,
    isSample: true,
  });
  await createBriefing(orgId, {
    templateKey: "engine.briefing.engagementDrop",
    params: { name: createdSubjects[1].name, points: 12, sinceRelative: "30 days ago" },
    severity: "watch",
    subjectId: createdSubjects[1].id,
    isSample: true,
  });

  await createFinding(orgId, {
    templateKey: "engine.finding.missedOneOnOnes",
    params: { name: createdSubjects[0].name, count: 2, days: 30 },
    subjectId: createdSubjects[0].id,
    isSample: true,
  });
  await createFinding(orgId, {
    templateKey: "engine.finding.workloadSpike",
    params: { name: createdSubjects[1].name, percent: 28, period: "month" },
    subjectId: createdSubjects[1].id,
    isSample: true,
  });

  await createPlaybook(orgId, {
    templateKey: "engine.playbook.stayInterview",
    params: { name: createdSubjects[0].name, days: 2 },
    isSample: true,
  });
  await createPlaybook(orgId, {
    templateKey: "engine.playbook.recognition",
    params: { name: createdSubjects[2].name, achievement: "shipping the Q3 roadmap", teamTerm: "team" },
    isSample: true,
  });

  await upsertOnboardingState(orgId, { sampleDataSeeded: true });
}

export async function removeSampleDataForOrg(orgId: string) {
  await deleteSampleEngineContent(orgId);
  await deleteSampleSubjects(orgId);
  await upsertOnboardingState(orgId, { sampleDataSeeded: false });
}
