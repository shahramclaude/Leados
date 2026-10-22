// LEADOS Part 31 — shock scenarios on top of the ecosystem graph.
// These wrap computeBlastRadius() with scenario framing so results can be
// handed to Part 06's digital twin and Part 24's war-game roles. Because the
// real Part 06/24 modules are not present in this repository snapshot, the
// hand-off is represented by a plain `warGameRoleRef` string the caller can
// wire to whatever role registry Part 24 defines.

import type { EcosystemGraph, BlastRadiusResult } from "./types";
import { computeBlastRadius } from "./metrics";

export type ScenarioType = "partner_loss" | "key_person_loss";

export interface ShockScenarioInput {
  type: ScenarioType;
  nodeId: string;
  /** Optional: Part 24 war-game role this scenario should be staged under. */
  warGameRoleRef?: string;
}

export interface ShockScenarioResult extends BlastRadiusResult {
  type: ScenarioType;
  warGameRoleRef: string | null;
  runAt: string;
  summary: string;
}

export function runShockScenario(
  graph: EcosystemGraph,
  input: ShockScenarioInput,
): ShockScenarioResult {
  const blast = computeBlastRadius(graph, input.nodeId);
  const node = graph.nodes.find((n) => n.id === input.nodeId);

  const summary =
    blast.totalAffectedNodes === 0
      ? `No modeled dependents found for ${node?.name ?? input.nodeId}; blast radius may be invisible to this graph (see Phase 5 limitations).`
      : `${blast.totalAffectedNodes} node(s) depend on ${node?.name ?? input.nodeId} directly or transitively; worst-case estimated recovery ${blast.maxRecoveryDays} day(s).`;

  return {
    ...blast,
    type: input.type,
    warGameRoleRef: input.warGameRoleRef ?? null,
    runAt: new Date().toISOString(),
    summary,
  };
}
