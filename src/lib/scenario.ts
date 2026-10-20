/**
 * scenario.ts — Part 06 section D: declarative, schema-validated scenario
 * spec for the Scenario Studio.
 *
 * Shape (per the standing order):
 *   { name, baseline, interventions: [{kind, params, startDay}],
 *     horizonDays, seeds }
 *
 * `baseline` describes a starting org: teams (agents grouped by skill),
 * a backlog (explicit items or a generator shorthand), WIP limits and an
 * intra-team communication density used to build the (metadata-only) comm
 * graph. Interventions mutate a deep-cloned baseline at `startDay`.
 */
import { z } from "zod";

export const InterventionKindSchema = z.enum(["hire", "delay", "restructure", "price", "process"]);
export type InterventionKind = z.infer<typeof InterventionKindSchema>;

export const TeamSpecSchema = z.object({
  id: z.string().min(1),
  skill: z.string().min(1),
  size: z.number().int().min(1).max(200),
  weeklyCapacityHours: z.number().min(1).max(80).default(38),
  commDensity: z.number().min(0).max(1).default(0.6),
});
export type TeamSpec = z.infer<typeof TeamSpecSchema>;

export const BacklogItemSchema = z.object({
  id: z.string().min(1),
  requiredSkill: z.string().min(1),
  estimatedHours: z.number().min(0.5).max(2000),
  priority: z.number().int().default(100),
  dependsOn: z.array(z.string()).default([]),
});
export type BacklogItemSpec = z.infer<typeof BacklogItemSchema>;

export const BacklogGeneratorSchema = z.object({
  count: z.number().int().min(1).max(5000),
  skillMix: z.record(z.string(), z.number().min(0)).refine((v) => Object.keys(v).length > 0, {
    message: "skillMix must declare at least one skill",
  }),
  avgHours: z.number().min(0.5).max(2000).default(20),
  hoursSigma: z.number().min(0).max(3).default(0.5),
});
export type BacklogGeneratorSpec = z.infer<typeof BacklogGeneratorSchema>;

export const BaselineSchema = z.object({
  teams: z.array(TeamSpecSchema).min(1),
  backlogItems: z.array(BacklogItemSchema).optional(),
  backlogGenerator: BacklogGeneratorSchema.optional(),
  wipLimits: z.object({ active: z.number().int().min(1).default(8), review: z.number().int().min(1).default(6) }),
  reviewFractionOfEstimate: z.number().min(0.05).max(1).default(0.3),
  serviceTimeNoise: z
    .object({ active: z.number().min(0).max(2).default(0.5), review: z.number().min(0).max(2).default(0.4) })
    .default({ active: 0.5, review: 0.4 }),
  handoffLatencyDaysCold: z.number().min(0).max(10).default(1),
  brooksCoefficientOverride: z.number().min(0).max(0.1).optional(),
  interruptionBaseline: z.number().min(0).max(0.9).default(0.12),
});
export type BaselineSpec = z.infer<typeof BaselineSchema>;

export const HireParamsSchema = z.object({ teamId: z.string(), count: z.number().int().min(1).max(50) });
export const DelayParamsSchema = z.object({ teamId: z.string().optional(), capacityMultiplier: z.number().min(0).max(1), durationDays: z.number().int().min(1).max(365) });
export const RestructureParamsSchema = z.object({ mergeTeamIds: z.array(z.string()).min(2), newTeamId: z.string() });
export const PriceParamsSchema = z.object({ budgetMultiplier: z.number().min(0).max(5) });
export const ProcessParamsSchema = z.object({ wipLimitDelta: z.number().int().min(-20).max(20).default(0), reviewFractionDelta: z.number().min(-0.5).max(0.5).default(0) });

export const InterventionSchema = z.object({
  kind: InterventionKindSchema,
  params: z.record(z.string(), z.unknown()),
  startDay: z.number().int().min(0),
});
export type Intervention = z.infer<typeof InterventionSchema>;

export const ScenarioSpecSchema = z.object({
  name: z.string().min(1).max(200),
  baseline: BaselineSchema,
  interventions: z.array(InterventionSchema).default([]),
  horizonDays: z.number().int().min(7).max(1095),
  seeds: z.array(z.union([z.string(), z.number()])).min(1).max(64),
});
export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;

export interface ValidationError {
  path: string;
  message: string;
}

export function validateScenarioSpec(json: unknown): { ok: true; spec: ScenarioSpec } | { ok: false; errors: ValidationError[] } {
  const result = ScenarioSpecSchema.safeParse(json);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

/** Narrow per-kind param validation, used after the generic schema passes. */
export function validateInterventionParams(intervention: Intervention): ValidationError[] {
  const schemaByKind: Record<InterventionKind, z.ZodTypeAny> = {
    hire: HireParamsSchema,
    delay: DelayParamsSchema,
    restructure: RestructureParamsSchema,
    price: PriceParamsSchema,
    process: ProcessParamsSchema,
  };
  const schema = schemaByKind[intervention.kind];
  const result = schema.safeParse(intervention.params);
  if (result.success) return [];
  return result.error.issues.map((i) => ({ path: `params.${i.path.join(".")}`, message: i.message }));
}
