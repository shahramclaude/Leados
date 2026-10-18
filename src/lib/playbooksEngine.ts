// src/lib/playbooksEngine.ts
// -----------------------------------------------------------------------
// LEADOS Part 9 — Playbooks Engine upgrade.
//
// Matches active findings to the best-fitting playbook, tracks step-by-step
// execution of a playbook run, and reports on how effective each playbook
// has historically been.
// -----------------------------------------------------------------------
import type { LeadosFinding, LeadosPlaybook, LeadosPlaybookRun } from "@/db/schema";

export interface PlaybookMatch {
  findingId: number;
  findingTitle: string;
  playbookId: number;
  playbookName: string;
  score: number;
  reasons: string[];
}

/**
 * For each active finding above severity 3, find the best matching playbook.
 * Score components: exact trigger-rule match (0.5), domain match (0.3),
 * historical success rate (up to 0.2).
 */
export function matchPlaybook(findings: LeadosFinding[], availablePlaybooks: LeadosPlaybook[]): PlaybookMatch[] {
  const matches: PlaybookMatch[] = [];
  const activeFindings = findings.filter((f) => f.status === "open" && f.severity > 3);

  for (const finding of activeFindings) {
    let best: PlaybookMatch | null = null;

    for (const pb of availablePlaybooks) {
      let score = 0;
      const reasons: string[] = [];

      if (finding.ruleId && pb.triggerRule && finding.ruleId === pb.triggerRule) {
        score += 0.5;
        reasons.push("exact rule match");
      }
      if (finding.domain === pb.domain) {
        score += 0.3;
        reasons.push("domain match");
      }
      const successContribution = pb.successRate * 0.2;
      score += successContribution;
      reasons.push(`historical success rate ${(pb.successRate * 100).toFixed(0)}%`);

      if (!best || score > best.score) {
        best = {
          findingId: finding.id,
          findingTitle: finding.title,
          playbookId: pb.id,
          playbookName: pb.name,
          score: Math.round(score * 100) / 100,
          reasons,
        };
      }
    }

    if (best && best.score > 0) matches.push(best);
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Records completion of a single playbook step, updating run progress,
 * running outcome score (average of per-step outcomes), and overall status.
 */
export function executePlaybookStep(
  run: LeadosPlaybookRun,
  stepIndex: number,
  outcome: "success" | "partial" | "failed",
): LeadosPlaybookRun {
  const stepsDone = Math.max(run.stepsDone, Math.min(run.stepsTotal, stepIndex + 1));
  const delta = outcome === "success" ? 1 : outcome === "partial" ? 0.5 : 0;
  const priorWeight = run.stepsDone;
  const newOutcomeScore = run.outcomeScore == null ? delta : (run.outcomeScore * priorWeight + delta) / (priorWeight + 1);
  const completed = stepsDone >= run.stepsTotal;
  const abandoned = !completed && outcome === "failed" && stepIndex === run.stepsTotal - 1;

  return {
    ...run,
    stepsDone,
    outcomeScore: Math.round(newOutcomeScore * 100) / 100,
    status: completed ? "completed" : abandoned ? "abandoned" : run.status,
    completedAt: completed ? new Date() : run.completedAt,
    notes: `${run.notes ? `${run.notes} | ` : ""}Step ${stepIndex + 1}: ${outcome}`.slice(0, 4000),
  };
}

export interface PlaybookStats {
  playbookId: number;
  playbookName: string;
  runs: number;
  avgCompletionRate: number;
  avgOutcomeScore: number;
  avgTimeToCompleteMs: number | null;
  frequencyTriggered: number;
  underperforming: boolean;
}

/**
 * For each playbook: average completion rate, average outcome score, average
 * time to complete, and how often it's been triggered. Flags underperformers.
 */
export function computePlaybookEffectiveness(runHistory: LeadosPlaybookRun[], playbooks: LeadosPlaybook[]): PlaybookStats[] {
  const byPlaybook = new Map<number, LeadosPlaybookRun[]>();
  for (const run of runHistory) {
    if (!byPlaybook.has(run.playbookId)) byPlaybook.set(run.playbookId, []);
    byPlaybook.get(run.playbookId)!.push(run);
  }

  const stats: PlaybookStats[] = [];
  for (const [playbookId, runs] of byPlaybook) {
    const pb = playbooks.find((p) => p.id === playbookId);
    const completionRates = runs.map((r) => (r.stepsTotal > 0 ? r.stepsDone / r.stepsTotal : 0));
    const outcomeScores = runs.filter((r) => r.outcomeScore != null).map((r) => r.outcomeScore as number);
    const completedRuns = runs.filter((r) => r.completedAt);
    const times = completedRuns.map((r) => new Date(r.completedAt as Date).getTime() - new Date(r.startedAt).getTime());

    const avgCompletionRate = completionRates.reduce((a, b) => a + b, 0) / (completionRates.length || 1);
    const avgOutcomeScore = outcomeScores.length ? outcomeScores.reduce((a, b) => a + b, 0) / outcomeScores.length : 0;
    const avgTimeToCompleteMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

    stats.push({
      playbookId,
      playbookName: pb?.name ?? `Playbook #${playbookId}`,
      runs: runs.length,
      avgCompletionRate: Math.round(avgCompletionRate * 100) / 100,
      avgOutcomeScore: Math.round(avgOutcomeScore * 100) / 100,
      avgTimeToCompleteMs,
      frequencyTriggered: runs.length,
      underperforming: avgOutcomeScore < 0.5 || avgCompletionRate < 0.6,
    });
  }

  return stats.sort((a, b) => b.frequencyTriggered - a.frequencyTriggered);
}
