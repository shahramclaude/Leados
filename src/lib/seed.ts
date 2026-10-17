// Deterministic synthetic roster. No real people, no network calls, no randomness
// at runtime (a fixed seed integer drives a tiny LCG so re-renders are stable).

import type { Person } from "./types";

const FIRST = ["Alex", "Jordan", "Riley", "Sam", "Taylor", "Morgan", "Casey", "Drew", "Quinn", "Avery", "Reese", "Jamie"];
const LAST = ["Chen", "Okafor", "Nguyen", "Patel", "Garcia", "Kowalski", "Haddad", "Silva", "Kim", "Fischer", "Rossi", "Novak"];
const ROLES = [
  "Engineering Manager",
  "Senior Engineer",
  "Product Manager",
  "Staff Engineer",
  "Design Lead",
  "Director",
  "Team Lead",
  "Analyst",
];

// Simple seeded LCG for reproducible "randomness" without Math.random().
function lcg(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function buildRoster(count = 12, seed = 20260101): Person[] {
  const rand = lcg(seed);
  const people: Person[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 3 + 1) % LAST.length]}`;
    people.push({
      id: `P${i + 1}`,
      name,
      role: ROLES[Math.floor(rand() * ROLES.length)],
      directReports: Math.floor(rand() * 9),
      tenureMonths: Math.floor(rand() * 60) + 1,
    });
  }
  return people;
}

export const ROSTER: Person[] = buildRoster();
