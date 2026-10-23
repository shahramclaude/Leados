// Zod request-validation schemas for the world-model API surface (Part 59).
// Every route parses its body through one of these before touching the DB —
// this is the fix for "trials=0", "SQL-injection via text fields", and
// "intervention step out of range" (see PHASE 5 ATTACK in the delivery notes).
import { z } from "zod";

const periodRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createMetricSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "key must be lowercase alphanumeric with - or _"),
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(32).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
});

export const createObservationSchema = z.object({
  period: z.string().regex(periodRegex, "period must be an ISO date (YYYY-MM-DD)"),
  value: z.number().finite(),
});

// Hard server-side caps regardless of what a client requests — this is what
// stops a trials=10_000_000 request from becoming a denial-of-service.
export const MAX_TRIALS = 5000;
export const MAX_HORIZON = 36;

export const runSimulationSchema = z
  .object({
    metricId: z.string().uuid(),
    label: z.string().trim().max(200).optional().default(""),
    horizon: z.number().int().min(1).max(MAX_HORIZON),
    trials: z.number().int().min(10).max(MAX_TRIALS),
    seed: z.number().int().min(0).max(2 ** 31 - 1),
    interventionFromStep: z.number().int().min(1).max(MAX_HORIZON).optional(),
    interventionDelta: z.number().finite().optional(),
  })
  .refine(
    (v) => (v.interventionFromStep == null) === (v.interventionDelta == null),
    "interventionFromStep and interventionDelta must be provided together",
  )
  .refine(
    (v) => v.interventionFromStep == null || v.interventionFromStep <= v.horizon,
    "interventionFromStep must be within the simulation horizon",
  );

export const runBacktestSchema = z.object({
  metricId: z.string().uuid(),
  cutoffPeriod: z.string().regex(periodRegex, "cutoffPeriod must be an ISO date (YYYY-MM-DD)"),
  horizon: z.number().int().min(1).max(MAX_HORIZON),
  trials: z.number().int().min(10).max(MAX_TRIALS).optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
});
