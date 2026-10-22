import { explain, type Explain, type Finding } from "@/lib/explain";
import type { ChangeProgram } from "./types";

export const DEFAULT_SATURATION_THRESHOLD = 3;

function isActiveOn(program: ChangeProgram, at: Date): boolean {
  if (program.status === "completed") return false;
  const start = new Date(program.startDate);
  return start <= at && (program.status === "active" || program.status === "planned" || program.status === "paused");
}

/**
 * Change-load index for a group: additive sum of `loadWeight` across every
 * program concurrently affecting that group at time `at`. Additive by
 * construction — the index for a union of programs equals the sum of the
 * indices each program contributes alone (tested as a property).
 */
export function changeLoadIndex(groupId: string, programs: readonly ChangeProgram[], at: Date): Explain<number> {
  const contributing = programs.filter((p) => p.affectedGroups.includes(groupId) && isActiveOn(p, at));
  const value = contributing.reduce((sum, p) => sum + p.loadWeight, 0);

  return explain(Number(value.toFixed(2)), "change_load_additive_v1", {
    groupId,
    at: at.toISOString(),
    concurrentProgramCount: contributing.length,
  }, {
    confidence: "high",
    caveats: [
      "loadWeight is a declared intensity per program (default 1), not independently measured effort — teams can under/over-declare it.",
      "This counts programs, not actual hours; two low-intensity programs can still saturate a group in practice.",
    ],
  });
}

/**
 * Saturation findings: groups whose change-load index exceeds the threshold,
 * with the contributing programs named so the finding is actionable.
 */
export function saturationFindings(
  groupIds: readonly string[],
  programs: readonly ChangeProgram[],
  at: Date,
  threshold: number = DEFAULT_SATURATION_THRESHOLD
): Finding[] {
  const findings: Finding[] = [];
  for (const groupId of groupIds) {
    const load = changeLoadIndex(groupId, programs, at);
    if (load.value > threshold) {
      const contributing = programs.filter((p) => p.affectedGroups.includes(groupId) && isActiveOn(p, at));
      findings.push({
        id: `saturation:${groupId}:${at.toISOString().slice(0, 10)}`,
        severity: load.value > threshold * 1.5 ? "critical" : "warning",
        title: `Group ${groupId} is absorbing ${contributing.length} simultaneous change programs`,
        detail: `Change-load index is ${load.value.toFixed(2)}, above the saturation threshold of ${threshold}. This is a finding, not a verdict: it flags saturation risk for review, not a guaranteed failure.`,
        evidence: {
          groupId,
          loadIndex: load.value,
          threshold,
          programs: contributing.map((p) => ({ id: p.id, intent: p.intent, loadWeight: p.loadWeight })),
        },
      });
    }
  }
  return findings;
}
