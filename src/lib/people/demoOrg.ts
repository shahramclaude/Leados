// src/lib/people/demoOrg.ts
//
// A small, deterministic DEMO organization for the Next.js app/API routes to
// actually show something. Unlike `seedOrg.ts`, this generator carries NO
// synthetic cohort/group label at all — production-shaped data never gets a
// field that even resembles a protected attribute, consented test fixture or
// otherwise. This is what `scripts/seed-db.ts` writes into Postgres.

import { SEED_ROLES } from "./roleSkillMap";
import { generatePersonEvidence } from "./seedOrg";
import { rngFor } from "../shared/prng";
import type { Person, SkillEvidence } from "./types";
import { SEED_BANDS, type EmployeeCompensation } from "./compensation";

export interface DemoOrg {
  teams: { id: string; name: string }[];
  employees: Person[];
  skillEvidence: SkillEvidence[];
  compensation: EmployeeCompensation[];
}

const TEAM_NAMES = ["Platform", "Product Eng", "Data", "Design", "Growth"];
const PEOPLE_PER_TEAM = 8;
const FIRST_NAMES = ["Avery", "Riley", "Jordan", "Morgan", "Taylor", "Casey", "Quinn", "Reese", "Sage", "Drew", "Emerson", "Hayden", "Rowan", "Skyler", "Finley", "Harper", "Kai", "Noor", "Luca", "Sam"];

export function generateDemoOrg(now: Date = new Date("2026-01-15T00:00:00Z")): DemoOrg {
  const teams = TEAM_NAMES.map((name, i) => ({ id: `demo-team-${i}`, name }));
  const employees: Person[] = [];
  const skillEvidence: SkillEvidence[] = [];
  const compensation: EmployeeCompensation[] = [];

  let globalIndex = 0;
  for (const team of teams) {
    const managerId = `${team.id}-manager`;
    employees.push({ id: managerId, name: `${team.name} Manager`, title: "Engineering Manager", teamId: team.id, managerId: null });

    for (let i = 0; i < PEOPLE_PER_TEAM; i++) {
      const personId = `demo-person-${globalIndex.toString().padStart(3, "0")}`;
      const role = SEED_ROLES[globalIndex % SEED_ROLES.length];
      const rand = rngFor(`demo-org:${personId}`);
      const name = `${FIRST_NAMES[globalIndex % FIRST_NAMES.length]} ${String.fromCharCode(65 + (globalIndex % 26))}.`;

      employees.push({ id: personId, name, title: role.name, teamId: team.id, managerId });
      skillEvidence.push(...generatePersonEvidence(personId, role, rand, now));

      const band = SEED_BANDS.find((b) => b.roleId === role.id) ?? SEED_BANDS[0];
      const noise = 1 + (rand() - 0.5) * 0.16;
      compensation.push({ employeeId: personId, bandId: band.id, currentPay: Math.round((band.mid * noise) / 100) * 100 });

      globalIndex += 1;
    }
  }

  return { teams, employees, skillEvidence, compensation };
}
