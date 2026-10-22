import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { metricConnectorRegistry, notificationChannelRegistry, playbookStepTypeRegistry } from "./registry";
import type { MetricConnector, NotificationChannel, PlaybookStepType } from "./types";

/* ------------------------------------------------------------------ *
 * Metric connectors IN: pull a single numeric sample from somewhere.
 * ------------------------------------------------------------------ */

const DbRowCountConfig = z.object({
  table: z.enum(["leads", "contacts", "deals"]),
  metricName: z.string().default("row_count"),
});

const dbRowCountConnector: MetricConnector<z.infer<typeof DbRowCountConfig>> = {
  id: "db-row-count",
  version: "1.0.0",
  description: "Counts rows in a whitelisted LEADOS table.",
  configSchema: DbRowCountConfig,
  async fetchMetric(config) {
    const result = await db.execute(sql`select count(*)::int as count from ${sql.identifier(config.table)}`);
    const count = Number((result.rows[0] as { count: number })?.count ?? 0);
    return { name: config.metricName, value: count, ts: new Date().toISOString() };
  },
};

/* ------------------------------------------------------------------ *
 * Notification channels OUT: deliver a notification somewhere.
 * ------------------------------------------------------------------ */

const SlackChannelConfig = z.object({
  webhookUrl: z.string().url().optional(),
});

/**
 * Reference integration: Slack incoming webhook. Chosen over a calendar
 * integration because it needs no OAuth/token-refresh flow to demonstrate
 * end-to-end (a bare HTTPS POST to a per-workspace URL), which keeps the
 * example runnable without external credentials while still exercising
 * Part 10's capability registry exactly like a calendar connector would.
 * See docs/API.md "Reference integration" for the full justification.
 */
const slackChannel: NotificationChannel<z.infer<typeof SlackChannelConfig>> = {
  id: "slack",
  version: "1.0.0",
  description: "Posts a message to a Slack Incoming Webhook URL.",
  configSchema: SlackChannelConfig,
  async send(payload, config) {
    const url = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    if (!url) {
      return { delivered: false, info: "no Slack webhook URL configured (set SLACK_WEBHOOK_URL)" };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `*[${payload.severity.toUpperCase()}] ${payload.title}*\n${payload.body}` }),
      });
      return { delivered: res.ok, info: `slack responded ${res.status}` };
    } catch (err) {
      return { delivered: false, info: err instanceof Error ? err.message : "unknown error" };
    }
  },
};

const GenericWebhookChannelConfig = z.object({ url: z.string().url() });

const genericWebhookChannel: NotificationChannel<z.infer<typeof GenericWebhookChannelConfig>> = {
  id: "generic-webhook",
  version: "1.0.0",
  description: "POSTs the notification payload as JSON to an arbitrary URL.",
  configSchema: GenericWebhookChannelConfig,
  async send(payload, config) {
    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { delivered: res.ok, info: `responded ${res.status}` };
    } catch (err) {
      return { delivered: false, info: err instanceof Error ? err.message : "unknown error" };
    }
  },
};

/* ------------------------------------------------------------------ *
 * Playbook step types.
 * ------------------------------------------------------------------ */

const DelayStepConfig = z.object({ ms: z.number().int().min(0).max(60_000).default(0) });

const delayStep: PlaybookStepType<z.infer<typeof DelayStepConfig>> = {
  id: "delay",
  version: "1.0.0",
  description: "Waits for the configured number of milliseconds.",
  configSchema: DelayStepConfig,
  async run(ctx, config) {
    ctx.log(`delay: waiting ${config.ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, config.ms));
  },
};

const NotifyStepConfig = z.object({
  channelId: z.string(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  channelConfig: z.record(z.string(), z.unknown()).optional(),
});

const notifyStep: PlaybookStepType<z.infer<typeof NotifyStepConfig>> = {
  id: "notify",
  version: "1.0.0",
  description: "Sends a notification through a registered notification channel.",
  configSchema: NotifyStepConfig,
  async run(ctx, config) {
    const channel = notificationChannelRegistry.require(config.channelId);
    const parsedChannelConfig = channel.configSchema.parse(config.channelConfig ?? {});
    const result = await channel.send(
      { title: config.title, body: config.body, severity: config.severity },
      parsedChannelConfig,
    );
    ctx.log(`notify via ${config.channelId}: delivered=${result.delivered} ${result.info ?? ""}`);
    return { delivered: result.delivered };
  },
};

let registered = false;

/** Idempotent: safe to call multiple times (hot reload, multiple route imports, tests). */
export function registerBuiltinExtensions() {
  if (registered) return;
  registered = true;
  metricConnectorRegistry.register(dbRowCountConnector);
  notificationChannelRegistry.register(slackChannel);
  notificationChannelRegistry.register(genericWebhookChannel);
  playbookStepTypeRegistry.register(delayStep);
  playbookStepTypeRegistry.register(notifyStep);
}
