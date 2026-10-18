// The Autonomous Agent Loop — a prioritized task queue executed within a
// strict three-level authority model:
//   Level 1: fully autonomous (read/analyze, cached)
//   Level 2: proposes, requires explicit user confirmation before anything
//            is written to state
//   Level 3: beyond agent authority — always escalated to the user
//
// Original implementation for this sandbox, built from the task's pasted
// "pt-V" brief's *described behavior* (LEADOS.agent) — no such module was
// found anywhere in github.com/wbweve/Leados this session.

import type { AgentTaskResult, AuthorityLevel, LeadosEvent, Person } from './types';
import { generateFromAnomalies } from './hypothesis';
import { detectBehaviorChangePoints, detectFrequencyAnomalies, detectTemporalClustering } from './emergent';
import { computeDecisionVelocity } from './metrics';

export interface AgentProposal {
  id: string;
  type: 'SETTING_CHANGE';
  setting: string;
  currentValue: any;
  proposedValue: any;
  rationale: string;
}

export interface AgentTaskDef {
  type: string;
  authority: AuthorityLevel;
  description: string;
  execute: (events: LeadosEvent[], roster: Person[], today: Date, settings: Record<string, any>) => any;
}

export const TASK_TYPES: Record<string, AgentTaskDef> = {
  GENERATE_HYPOTHESIS: {
    type: 'GENERATE_HYPOTHESIS',
    authority: 1,
    description: 'Generate hypotheses from current data anomalies',
    execute: (events, _roster, today) => generateFromAnomalies(events, today),
  },
  DETECT_EMERGENT: {
    type: 'DETECT_EMERGENT',
    authority: 1,
    description: 'Run emergent pattern detection (frequency, temporal, behavioral)',
    execute: (events, roster, today) => ({
      frequency: detectFrequencyAnomalies(events, today),
      temporal: detectTemporalClustering(events),
      behavioral: detectBehaviorChangePoints(events, roster, today),
    }),
  },
  SCAN_DECISION_LOAD: {
    type: 'SCAN_DECISION_LOAD',
    authority: 1,
    description: 'Compute decision velocity for the attention plan',
    execute: (events, _roster, today) => ({ decisionVelocity30d: computeDecisionVelocity(events, today) }),
  },
  PROPOSE_CADENCE_CHANGE: {
    type: 'PROPOSE_CADENCE_CHANGE',
    authority: 2,
    description: 'Propose a 1:1 cadence change for user confirmation',
    execute: (_events, _roster, _today, settings) => {
      const proposal: AgentProposal = {
        id: 'prop_cadence_' + Date.now().toString(36),
        type: 'SETTING_CHANGE',
        setting: 'cadenceDays',
        currentValue: settings.cadenceDays,
        proposedValue: Math.max(7, (settings.cadenceDays ?? 14) - 3),
        rationale: 'Recent conflict concentration + a behavioral change point suggest tightening 1:1 cadence would help surface issues sooner.',
      };
      return proposal;
    },
  },
  PERSONNEL_DECISION: {
    type: 'PERSONNEL_DECISION',
    authority: 3,
    description: 'Any decision affecting employment status',
    execute: () => ({
      escalated: true,
      reason: 'Personnel decisions are beyond agent authority. Human judgment required.',
    }),
  },
};

export function buildTaskQueue(events: LeadosEvent[], today: Date): { type: string; priority: number }[] {
  const queue = [
    { type: 'DETECT_EMERGENT', priority: 10 },
    { type: 'SCAN_DECISION_LOAD', priority: 8 },
  ];
  const hypPreview = generateFromAnomalies(events, today);
  if (hypPreview.hypotheses.length > 0) queue.push({ type: 'GENERATE_HYPOTHESIS', priority: 9 });

  const recentConflictConcentration = hypPreview.hypotheses.some((h) => h.source === 'conflict_concentration');
  if (recentConflictConcentration) queue.push({ type: 'PROPOSE_CADENCE_CHANGE', priority: 7 });

  // Always demonstrate the escalation path at least once per run.
  queue.push({ type: 'PERSONNEL_DECISION', priority: 1 });

  return queue.sort((a, b) => b.priority - a.priority);
}

export interface AgentLoopRun {
  tasksExecuted: number;
  tasksEscalated: number;
  tasksErrored: number;
  tasksQueued: number;
  results: AgentTaskResult[];
  pendingProposals: AgentProposal[];
  label: string;
}

export async function runAgentLoop(
  events: LeadosEvent[],
  roster: Person[],
  today: Date,
  settings: Record<string, any>
): Promise<AgentLoopRun> {
  const results: AgentTaskResult[] = [];
  const pendingProposals: AgentProposal[] = [];
  const tasks = buildTaskQueue(events, today);

  for (const task of tasks) {
    const def = TASK_TYPES[task.type];
    if (!def) continue;

    if (def.authority >= 3) {
      results.push({ task: task.type, status: 'ESCALATED', authority: def.authority });
      continue;
    }

    try {
      const result = def.execute(events, roster, today, settings);
      if (def.authority === 2) {
        pendingProposals.push(result as AgentProposal);
        results.push({ task: task.type, status: 'QUEUED', authority: def.authority, result });
      } else {
        results.push({ task: task.type, status: 'COMPLETED', authority: def.authority, result });
      }
    } catch (e: any) {
      results.push({ task: task.type, status: 'ERROR', authority: def.authority, error: e?.message ?? String(e) });
    }
  }

  return {
    tasksExecuted: results.filter((r) => r.status === 'COMPLETED').length,
    tasksEscalated: results.filter((r) => r.status === 'ESCALATED').length,
    tasksErrored: results.filter((r) => r.status === 'ERROR').length,
    tasksQueued: results.filter((r) => r.status === 'QUEUED').length,
    results,
    pendingProposals,
    label:
      `Agent loop: ${results.length} tasks — ${results.filter((r) => r.status === 'COMPLETED').length} completed, ` +
      `${pendingProposals.length} queued for your confirmation, ${results.filter((r) => r.status === 'ESCALATED').length} escalated. ` +
      'Nothing written to your data without confirmation.',
  };
}
