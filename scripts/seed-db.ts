// scripts/seed-db.ts  ->  `npm run db:seed`
//
// Writes the small deterministic demo org (src/lib/people/demoOrg.ts) plus
// the static skill/role/compensation-band catalogs into Postgres so the
// Next.js app has real data to render. This is demo/reference data only —
// it carries no fairness-test cohort label (see demoOrg.ts header).

import "dotenv/config";
import { db } from "../src/db";
import { compensationBands, employeeCompensation, employees, personSkillEvidence, roles, skills, teams } from "../src/db/schema";
import { SEED_SKILLS } from "../src/lib/people/skillsOntology";
import { SEED_ROLES } from "../src/lib/people/roleSkillMap";
import { SEED_BANDS } from "../src/lib/people/compensation";
import { generateDemoOrg } from "../src/lib/people/demoOrg";

async function main() {
  console.log("Seeding LEADOS people-analytics demo data...");

  await db.delete(personSkillEvidence);
  await db.delete(employeeCompensation);
  await db.delete(employees);
  await db.delete(teams);
  await db.delete(roles);
  await db.delete(compensationBands);
  await db.delete(skills);

  await db.insert(skills).values(
    SEED_SKILLS.map((s) => ({ id: s.id, name: s.name, category: s.category, requires: s.requires, specializes: s.specializes, equivalent: s.equivalent, levelAnchors: s.levelAnchors })),
  );

  await db.insert(roles).values(
    SEED_ROLES.map((r) => ({ id: r.id, name: r.name, coreSkills: r.coreSkills, complementarySkills: r.complementarySkills, adjacencyRoles: r.adjacencyRoles })),
  );

  await db.insert(compensationBands).values(SEED_BANDS);

  const org = generateDemoOrg();

  await db.insert(teams).values(org.teams);
  await db.insert(employees).values(org.employees.map((e) => ({ id: e.id, name: e.name, title: e.title, teamId: e.teamId, managerId: e.managerId })));

  await db.insert(personSkillEvidence).values(
    org.skillEvidence.map((e) => ({
      id: e.id,
      personId: e.personId,
      skillId: e.skillId,
      source: e.source,
      level: e.level,
      recordedAt: new Date(e.recordedAt),
      evidenceRef: e.evidenceRef ?? null,
      recordedBy: e.recordedBy ?? null,
      invalidated: e.invalidated ?? false,
    })),
  );

  await db.insert(employeeCompensation).values(org.compensation);

  console.log(`Seeded ${org.teams.length} teams, ${org.employees.length} employees, ${org.skillEvidence.length} evidence rows, ${org.compensation.length} compensation rows.`);
  console.log(`Seeded ${SEED_SKILLS.length} skills, ${SEED_ROLES.length} roles, ${SEED_BANDS.length} compensation bands.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
