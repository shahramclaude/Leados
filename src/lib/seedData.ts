import type { Person } from "./peopleIntel";
import type { ProjectNode } from "./strategicIntel";

const DEPARTMENTS = ["Engineering", "Sales", "Product", "Design", "Ops"];
const ROLES = ["IC", "Senior IC", "Lead", "Manager", "Director"];
const SKILL_POOL = [
  "typescript",
  "react",
  "postgres",
  "sales-ops",
  "figma",
  "forecasting",
  "leadership",
  "negotiation",
  "data-analysis",
  "product-strategy",
];

function mulberrySeeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeedPeople(count = 50): Person[] {
  const rng = mulberrySeeded(7);
  const people: Person[] = [];
  for (let i = 1; i <= count; i++) {
    const skillCount = 1 + Math.floor(rng() * 4);
    const skills: string[] = [];
    for (let s = 0; s < skillCount; s++) {
      skills.push(SKILL_POOL[Math.floor(rng() * SKILL_POOL.length)]);
    }
    people.push({
      id: i,
      name: `Person ${i}`,
      role: ROLES[Math.floor(rng() * ROLES.length)],
      department: DEPARTMENTS[Math.floor(rng() * DEPARTMENTS.length)],
      managerId: i === 1 ? null : Math.max(1, Math.floor(rng() * (i - 1))),
      performanceScore: rng(),
      potentialScore: rng(),
      flightRiskScore: rng(),
      burnoutRiskScore: rng(),
      tenureMonths: Math.floor(rng() * 60) + 1,
      skills: Array.from(new Set(skills)),
      isCritical: rng() > 0.85,
    });
  }
  return people;
}

export function buildSeedProjects(count = 20): ProjectNode[] {
  const rng = mulberrySeeded(13);
  const projects: ProjectNode[] = [];
  for (let i = 1; i <= count; i++) {
    const deps: number[] = [];
    if (i > 1 && rng() > 0.4) {
      deps.push(Math.max(1, i - 1 - Math.floor(rng() * 2)));
    }
    projects.push({
      id: i,
      name: `Project ${i}`,
      durationDays: 3 + Math.floor(rng() * 20),
      dependencies: Array.from(new Set(deps)).filter((d) => d !== i && d >= 1 && d < i),
    });
  }
  return projects;
}

export function buildSeedEvents(count = 100): { type: string; createdAt: Date }[] {
  const rng = mulberrySeeded(23);
  const types = ["deploy", "incident", "churn", "signup", "meeting", "review"];
  const events: { type: string; createdAt: Date }[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    events.push({
      type: types[Math.floor(rng() * types.length)],
      createdAt: new Date(now - Math.floor(rng() * 1000 * 60 * 60 * 24 * 30)),
    });
  }
  return events;
}
