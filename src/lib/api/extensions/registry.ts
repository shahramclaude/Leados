import { z } from "zod";
import { assertCapability, type Capability } from "../capability";

// ---------------------------------------------------------------------------
// Section E — typed extension registry.
//
// Third-party code never touches `db` or `fetch` directly from inside a
// step/connector/channel implementation's business logic path that this
// module controls: every built-in helper exposed on `ExtensionContext`
// (`ctx.sendNotification`, `ctx.ingestMetric`, `ctx.readLead`, ...) calls
// `assertCapability()` first. A custom extension can only do what its
// declared `kind` is allowed to do, and only through these helpers — there
// is no escape hatch to raw persistence. See examples/reference-extension
// for a worked, registered third-party extension.
// ---------------------------------------------------------------------------

export type ExtensionKind = "connector" | "channel" | "step";

export interface ExtensionContext {
  orgId: string;
  correlationId: string;
  ingestMetric: (metric: string, value: number, unit: string) => Promise<void>;
  sendNotification: (channelType: string, channelConfig: unknown, message: string) => Promise<{ delivered: boolean }>;
}

export interface ConnectorDefinition<Config = unknown, Output = unknown> {
  kind: "connector";
  type: string;
  description: string;
  configSchema: z.ZodType<Config>;
  requiredCapability: Capability;
  // Method syntax (vs. an arrow-function property) opts into TypeScript's
  // bivariant parameter checking for methods, which is what lets each
  // concrete extension declare its own narrower `Config`/`Input`/`Output`
  // while still structurally satisfying the widened `ExtensionDefinition`
  // union used for storage/dispatch in the registry map.
  fetchMetric(config: Config, ctx: ExtensionContext): Promise<Output>;
}

export interface ChannelDefinition<Config = unknown> {
  kind: "channel";
  type: string;
  description: string;
  configSchema: z.ZodType<Config>;
  requiredCapability: Capability;
  send(config: Config, message: string, ctx: ExtensionContext): Promise<{ delivered: boolean; detail?: string }>;
}

export interface StepDefinition<Config = unknown, Input = unknown, Output = unknown> {
  kind: "step";
  type: string;
  description: string;
  configSchema: z.ZodType<Config>;
  requiredCapability: Capability;
  run(config: Config, input: Input, ctx: ExtensionContext): Promise<Output>;
}

export type ExtensionDefinition = ConnectorDefinition | ChannelDefinition | StepDefinition;

const registry = new Map<string, ExtensionDefinition>();

function keyFor(kind: ExtensionKind, type: string) {
  return `${kind}:${type}`;
}

// Identity helpers that force TypeScript to unify the `Config`/`Input`/
// `Output` generics across `configSchema` and the handler function in a
// single inference step (plain object literals typed only via `T extends
// ExtensionDefinition` do not unify generics shared across sibling
// properties).
export function defineConnector<C, O>(def: ConnectorDefinition<C, O>): ConnectorDefinition<C, O> {
  return def;
}
export function defineChannel<C>(def: ChannelDefinition<C>): ChannelDefinition<C> {
  return def;
}
export function defineStep<C, I, O>(def: StepDefinition<C, I, O>): StepDefinition<C, I, O> {
  return def;
}

export function registerExtension<T extends ExtensionDefinition>(def: T) {
  const key = keyFor(def.kind, def.type);
  if (registry.has(key)) {
    throw new Error(`Extension ${key} is already registered.`);
  }
  registry.set(key, def as unknown as ExtensionDefinition);
}

export function getExtension(kind: ExtensionKind, type: string): ExtensionDefinition | undefined {
  return registry.get(keyFor(kind, type));
}

export function listExtensions(kind?: ExtensionKind): ExtensionDefinition[] {
  return [...registry.values()].filter((d) => !kind || d.kind === kind);
}

export function makeContext(orgId: string, correlationId: string): ExtensionContext {
  return {
    orgId,
    correlationId,
    async ingestMetric(metric, value, unit) {
      assertCapability(orgId, "metric.ingest");
      // Reference implementation: metrics are appended to the event log so
      // they are observable via GET /api/v1/events and the realtime stream,
      // without granting extensions direct table access.
      const { emitEvent } = await import("../stream");
      await emitEvent(orgId, "metric.ingested", { metric, value, unit }, correlationId);
    },
    async sendNotification(channelType, channelConfig, message) {
      assertCapability(orgId, "notification.send");
      const def = getExtension("channel", channelType);
      if (!def || def.kind !== "channel") {
        throw new Error(`Unknown notification channel type "${channelType}".`);
      }
      const config = def.configSchema.parse(channelConfig);
      const result = await def.send(config, message, makeContext(orgId, correlationId));
      return { delivered: result.delivered };
    },
  };
}

// ---- Built-in extensions ---------------------------------------------------

registerExtension(defineChannel({
  kind: "channel",
  type: "log-channel",
  description: "Writes the notification to the platform event log (always available; useful for testing playbooks).",
  configSchema: z.object({}).strict(),
  requiredCapability: "notification.send",
  async send(_config, message, ctx) {
    const { emitEvent } = await import("../stream");
    await emitEvent(ctx.orgId, "notification.sent", { channel: "log-channel", message }, ctx.correlationId);
    return { delivered: true, detail: "logged" };
  },
}));

registerExtension(defineChannel({
  kind: "channel",
  type: "slack-incoming-webhook",
  description: "Posts the notification to a Slack incoming webhook URL captured during OAuth install.",
  configSchema: z.object({ webhookUrl: z.string().url() }),
  requiredCapability: "notification.send",
  async send(config, message) {
    try {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(8000),
      });
      return { delivered: res.ok, detail: `status=${res.status}` };
    } catch (err) {
      return { delivered: false, detail: err instanceof Error ? err.message : "error" };
    }
  },
}));

registerExtension(defineStep({
  kind: "step",
  type: "lead.rescore",
  description: "Recomputes a lead's score from a simple engagement heuristic and persists it.",
  configSchema: z.object({}).strict(),
  requiredCapability: "lead.write",
  async run(_config, input: { leadId: string }, ctx) {
    assertCapability(ctx.orgId, "lead.write");
    const { db } = await import("@/db");
    const { leads } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.orgId, ctx.orgId)))
      .limit(1);
    if (!lead) throw new Error(`Lead ${input.leadId} not found.`);
    const base = lead.stage === "won" ? 100 : lead.stage === "engaged" ? 70 : lead.stage === "qualified" ? 50 : 20;
    const score = Math.min(100, base + Math.round((lead.company ? 5 : 0) + Math.random() * 5));
    await db.update(leads).set({ score, updatedAt: new Date() }).where(eq(leads.id, lead.id));
    return { leadId: lead.id, score };
  },
}));

registerExtension(defineStep({
  kind: "step",
  type: "notify",
  description: "Sends a notification via a configured channel type as an automation step.",
  configSchema: z.object({ channelType: z.string(), channelConfig: z.unknown().optional(), message: z.string() }),
  requiredCapability: "automation.step.execute",
  async run(config, _input, ctx) {
    return ctx.sendNotification(config.channelType, config.channelConfig ?? {}, config.message);
  },
}));
