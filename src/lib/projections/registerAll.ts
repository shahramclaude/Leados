// LEADOS Part 01 — single place that registers every projector with the
// engine. Import this module (for its side effects) before calling
// applyEnvelopeSync/rebuildProjections/any hot query. eventStore.ts and every
// script under scripts/ do this once at startup.
//
// Adding a 9th domain or a new projector in a future part: add one line here.
// Do not register projectors anywhere else.
import { registerProjector } from "./engine";
import { peopleRosterProjector } from "./projectors/peopleRoster";
import { peopleFlightRiskProjector } from "./projectors/peopleFlightRisk";
import { financeBurnProjector } from "./projectors/financeBurn";
import { strategyInitiativeProjector } from "./projectors/strategyInitiative";
import { executionBoardProjector } from "./projectors/executionBoard";
import { rdProductRoadmapProjector } from "./projectors/rdProductRoadmap";
import { salesPipelineProjector } from "./projectors/salesPipeline";
import { knowledgeActivityProjector } from "./projectors/knowledgeActivity";
import { manufacturingThroughputProjector } from "./projectors/manufacturingThroughput";

let registered = false;

export function ensureProjectorsRegistered(): void {
  if (registered) return;
  registered = true;
  registerProjector(peopleRosterProjector);
  registerProjector(peopleFlightRiskProjector);
  registerProjector(financeBurnProjector);
  registerProjector(strategyInitiativeProjector);
  registerProjector(executionBoardProjector);
  registerProjector(rdProductRoadmapProjector);
  registerProjector(salesPipelineProjector);
  registerProjector(knowledgeActivityProjector);
  registerProjector(manufacturingThroughputProjector);
}
