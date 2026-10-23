// Part 09 (stub — source file not present in this snapshot): Growth Paths.
// Part 45 (stub — source file not present in this snapshot): Time allocation data.
//
// Minimal shapes used by the delegation growth check (advisory, non-blocking):
// does a task's skill tags overlap a candidate delegate's stated growth goal,
// and do they currently have under-allocated time in that skill category
// (load-aware suggestion)?

export type GrowthGoal = {
  personId: string;
  goalLabel: string;
  relatedSkillTags: string[];
};

export type TimeAllocationRow = {
  personId: string;
  weekOf: string;
  category: string;
  hours: number;
};

export function overlappingSkills(taskTags: string[], goal: GrowthGoal): string[] {
  const goalTags = new Set(goal.relatedSkillTags.map((t) => t.toLowerCase()));
  return taskTags.filter((t) => goalTags.has(t.toLowerCase()));
}

/** Hours already spent this week by the person in a given skill category. */
export function hoursInCategory(
  rows: TimeAllocationRow[],
  personId: string,
  weekOf: string,
  category: string,
): number {
  return rows
    .filter((r) => r.personId === personId && r.weekOf === weekOf && r.category === category)
    .reduce((sum, r) => sum + r.hours, 0);
}
