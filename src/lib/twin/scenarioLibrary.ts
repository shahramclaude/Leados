// src/lib/twin/scenarioLibrary.ts
//
// Loads the no-code scenario presets from /scenarios/*.json for the
// Simulation Lab's "load preset" picker.

import type { ScenarioInput } from "./types";
import baseline from "../../../scenarios/baseline.json";
import interventionHiringSurge from "../../../scenarios/intervention-hiring-surge.json";
import shockAttritionSpike from "../../../scenarios/shock-attrition-spike.json";
import shockDemandSurge from "../../../scenarios/shock-demand-surge.json";
import shockKeyPersonLoss from "../../../scenarios/shock-key-person-loss.json";
import shockBudgetCut from "../../../scenarios/shock-budget-cut.json";
import shockQualityIncident from "../../../scenarios/shock-quality-incident.json";

export interface ScenarioPreset {
  id: string;
  group: "baseline" | "intervention" | "shock";
  scenario: ScenarioInput;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: "baseline", group: "baseline", scenario: baseline as ScenarioInput },
  { id: "intervention-hiring-surge", group: "intervention", scenario: interventionHiringSurge as ScenarioInput },
  { id: "shock-attrition-spike", group: "shock", scenario: shockAttritionSpike as ScenarioInput },
  { id: "shock-demand-surge", group: "shock", scenario: shockDemandSurge as ScenarioInput },
  { id: "shock-key-person-loss", group: "shock", scenario: shockKeyPersonLoss as ScenarioInput },
  { id: "shock-budget-cut", group: "shock", scenario: shockBudgetCut as ScenarioInput },
  { id: "shock-quality-incident", group: "shock", scenario: shockQualityIncident as ScenarioInput },
];

export function findPreset(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((p) => p.id === id);
}
