import type { TwinState } from "../twin/types";
import type { RoleId } from "./roles";
import type { RoleMove, WarGameEvent, WarGameResult } from "./engine";

export interface RoleSummary {
  roleId: RoleId;
  totalMoves: number;
  activeMoves: number; // moves with non-empty parameterDeltas
  actions: string[];
}

export interface MetricDelta {
  metric: string;
  start: number;
  end: number;
  delta: number;
}

export interface AfterActionReview {
  scenarioId: string;
  turns: number;
  generatedAt: string;
  roleSummaries: RoleSummary[];
  metricDeltas: MetricDelta[];
  narrative: string[];
}

/**
 * Auto-generate an after-action review from a war-game's event log and
 * trace — no manual write-up required to get a first-pass record of what
 * happened and who did what.
 */
export function generateAfterActionReview(result: WarGameResult): AfterActionReview {
  const roleSummaries: RoleSummary[] = Object.entries(result.movesByRole).map(([roleId, moves]) => summarizeRole(roleId as RoleId, moves));

  const start = result.trace[0];
  const end = result.trace[result.trace.length - 1];
  const metricDeltas = diffMetrics(start, end);

  const narrative = buildNarrative(result.events, metricDeltas);

  return {
    scenarioId: result.scenarioId,
    turns: result.turns,
    generatedAt: new Date().toISOString(),
    roleSummaries,
    metricDeltas,
    narrative,
  };
}

function summarizeRole(roleId: RoleId, moves: RoleMove[]): RoleSummary {
  const activeMoves = moves.filter((m) => Object.keys(m.parameterDeltas).length > 0);
  return {
    roleId,
    totalMoves: moves.length,
    activeMoves: activeMoves.length,
    actions: moves.map((m) => `T${m.turn}: ${m.action}`),
  };
}

function diffMetrics(start: TwinState, end: TwinState): MetricDelta[] {
  return Object.keys(start.metrics).map((metric) => {
    const s = start.metrics[metric] ?? 0;
    const e = end.metrics[metric] ?? 0;
    return { metric, start: s, end: e, delta: e - s };
  });
}

function buildNarrative(events: WarGameEvent[], deltas: MetricDelta[]): string[] {
  const lines: string[] = [];
  const resolveEvents = events.filter((e) => e.phase === "resolve");
  lines.push(`${resolveEvents.length} turn(s) resolved via deterministic twin steps.`);

  const biggestMover = [...deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (biggestMover) {
    lines.push(`Largest net movement: ${biggestMover.metric} shifted ${biggestMover.delta >= 0 ? "+" : ""}${biggestMover.delta.toFixed(3)} over the run.`);
  }

  const shockEvents = events.filter((e) => e.roleId === "system" && e.phase === "act");
  for (const e of shockEvents) lines.push(`Turn ${e.turn}: ${e.description}`);

  lines.push("This is a record of one seeded play-through of a modeled possibility — not a transcript of events that happened, and not a prediction of what will happen.");
  return lines;
}
