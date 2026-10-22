import type { z } from "zod";

/**
 * Extension seams (Part 16): three typed registries that let LEADOS grow
 * without touching core route code. Every extension declares a zod
 * `configSchema` (its "policy interface") and the registry validates both
 * the schema and the required function shape before allowing registration.
 */

export type MetricSample = { name: string; value: number; unit?: string; ts: string };

export interface MetricConnector<Config = unknown> {
  id: string;
  version: string;
  description: string;
  configSchema: z.ZodType<Config>;
  /** Fetches a single current metric sample for the given validated config. */
  fetchMetric(config: Config): Promise<MetricSample>;
}

export type NotificationPayload = {
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
};

export interface NotificationChannel<Config = unknown> {
  id: string;
  version: string;
  description: string;
  configSchema: z.ZodType<Config>;
  /** Delivers a notification; returns true on success. Must not throw for expected failures. */
  send(payload: NotificationPayload, config: Config): Promise<{ delivered: boolean; info?: string }>;
}

export type PlaybookStepContext = {
  runId: string;
  correlationId: string;
  input: Record<string, unknown>;
  log: (message: string) => void;
};

export interface PlaybookStepType<Config = unknown> {
  id: string;
  version: string;
  description: string;
  configSchema: z.ZodType<Config>;
  run(ctx: PlaybookStepContext, config: Config): Promise<Record<string, unknown> | void>;
}
