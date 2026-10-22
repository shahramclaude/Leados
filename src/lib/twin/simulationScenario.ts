// src/lib/twin/simulationScenario.ts
//
// Scenario schema, defaults, validation and stable hashing. The scenario
// hash is part of the cache key `(scenarioHash, seed, modelVersion)` and is
// also what the reproducibility chip shows in the UI.

import { z } from "zod";
import type { ScenarioDefinition, ScenarioInput, ShockEvent } from "./types";
import { hashObject } from "./prng";

const shockBaseSchema = z.object({
  weekApplied: z.number().int().min(1),
  label: z.string().optional(),
});

export const shockSchema: z.ZodType<ShockEvent> = z.discriminatedUnion("type", [
  shockBaseSchema.extend({ type: z.literal("attritionSpike"), extraDeparturesFraction: z.number().min(0).max(1) }),
  shockBaseSchema.extend({
    type: z.literal("demandSurge"),
    arrivalMultiplier: z.number().min(0),
    durationWeeks: z.number().int().min(1),
  }),
  shockBaseSchema.extend({ type: z.literal("keyPersonLoss"), personId: z.string().optional() }),
  shockBaseSchema.extend({
    type: z.literal("budgetCut"),
    wipLimitReduction: z.number().min(0),
    capacityReductionFraction: z.number().min(0).max(1),
  }),
  shockBaseSchema.extend({
    type: z.literal("qualityIncident"),
    reworkItems: z.number().int().min(0),
    moraleHitFraction: z.number().min(0).max(1),
  }),
]);

export const scenarioInputSchema: z.ZodType<ScenarioInput> = z.object({
  name: z.string().min(1).max(80),
  horizonWeeks: z.number().int().min(4).max(520),
  orgSize: z.number().int().min(10).max(2000),
  teamCount: z.number().int().min(1).max(10),
  arrivalRateLambda: z.number().min(0.01).max(100),
  effortMeanHrs: z.number().min(4).max(5000),
  effortSpread: z.number().min(0.05).max(2),
  wipLimit: z.number().int().min(1).max(500),
  queueDiscipline: z.enum(["fifo", "priority"]),
  headcountDeltaFraction: z.number().min(-0.9).max(3),
  headcountChangeWeek: z.number().int().min(1).max(520),
  demandMultiplier: z.number().min(0.1).max(5),
  costPerHeadWeek: z.number().min(0).max(100000),
  costPerEffortHr: z.number().min(0).max(10000),
  valuePerEffortHr: z.number().min(0).max(10000),
  shocks: z.array(shockSchema).max(10),
  ensembleRuns: z.number().int().min(10).max(10000),
  seedBase: z.number().int().min(0),
});

export const DEFAULT_SCENARIO: ScenarioInput = {
  name: "Baseline",
  horizonWeeks: 52,
  orgSize: 120,
  teamCount: 8,
  arrivalRateLambda: 1.5,
  effortMeanHrs: 380,
  effortSpread: 0.55,
  wipLimit: 15,
  queueDiscipline: "fifo",
  headcountDeltaFraction: 0,
  headcountChangeWeek: 1,
  demandMultiplier: 1,
  costPerHeadWeek: 2200,
  costPerEffortHr: 85,
  valuePerEffortHr: 140,
  shocks: [],
  ensembleRuns: 2000,
  seedBase: 20240601,
};

export function scenarioHash(input: ScenarioInput): string {
  // Hash everything except the run-count/seed knobs that don't change the
  // underlying world dynamics being compared, and the display name.
  const { ensembleRuns: _ensembleRuns, seedBase: _seedBase, name: _name, ...rest } = input;
  return hashObject(rest);
}

export function toScenarioDefinition(input: ScenarioInput): ScenarioDefinition {
  return { ...input, scenarioHash: scenarioHash(input) };
}

export function validateScenarioInput(payload: unknown): ScenarioInput {
  return scenarioInputSchema.parse(payload);
}

export function mergeScenario(base: ScenarioInput, patch: Partial<ScenarioInput>): ScenarioInput {
  return { ...base, ...patch, shocks: patch.shocks ?? base.shocks };
}
