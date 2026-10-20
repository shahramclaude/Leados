/**
 * scmSupply.ts — pure (no DB) default skill-supply table, split out of
 * `scm.ts` so that pure computation modules (e.g. `scenarioEngine.ts`,
 * which runs inside the Monte Carlo worker-thread code path too) never
 * need a live `DATABASE_URL` just to read a default hiring-cost table.
 */
export interface SkillSupply {
  skill: string;
  hourlyCost: number;
  leadTimeDays: number;
  capacityPerMonth: number;
}

export const DEFAULT_SUPPLY: SkillSupply[] = [
  { skill: "backend", hourlyCost: 85, leadTimeDays: 45, capacityPerMonth: 3 },
  { skill: "frontend", hourlyCost: 75, leadTimeDays: 35, capacityPerMonth: 4 },
  { skill: "design", hourlyCost: 70, leadTimeDays: 30, capacityPerMonth: 2 },
  { skill: "data", hourlyCost: 95, leadTimeDays: 55, capacityPerMonth: 2 },
  { skill: "general", hourlyCost: 65, leadTimeDays: 30, capacityPerMonth: 5 },
];

export function defaultSupplyTable(): SkillSupply[] {
  return DEFAULT_SUPPLY.map((s) => ({ ...s }));
}

export function defaultSupplyFor(skill: string): SkillSupply {
  return DEFAULT_SUPPLY.find((s) => s.skill === skill) ?? DEFAULT_SUPPLY[DEFAULT_SUPPLY.length - 1];
}
