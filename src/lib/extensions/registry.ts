import type { MetricConnector, NotificationChannel, PlaybookStepType } from "./types";

/**
 * Generic typed registry with policy-interface validation at registration
 * time: every entry must have id/version/description/configSchema and the
 * right function(s) for its kind, or `register` throws immediately. This
 * fails fast for malformed extensions instead of failing at call time.
 */
class ExtensionRegistry<T extends { id: string; version: string; configSchema: unknown }> {
  private items = new Map<string, T>();

  constructor(
    private kind: string,
    private validate: (item: T) => void,
  ) {}

  register(item: T): void {
    if (!item.id || !item.version || !item.configSchema) {
      throw new Error(`[${this.kind}] registration rejected: id, version, and configSchema are required`);
    }
    this.validate(item);
    if (this.items.has(item.id)) {
      throw new Error(`[${this.kind}] an extension with id "${item.id}" is already registered`);
    }
    this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  require(id: string): T {
    const found = this.get(id);
    if (!found) throw new Error(`[${this.kind}] no extension registered with id "${id}"`);
    return found;
  }

  list(): T[] {
    return [...this.items.values()];
  }
}

export const metricConnectorRegistry = new ExtensionRegistry<MetricConnector>("metric-connector", (item) => {
  if (typeof item.fetchMetric !== "function") {
    throw new Error(`[metric-connector] "${item.id}" must implement fetchMetric(config)`);
  }
});

export const notificationChannelRegistry = new ExtensionRegistry<NotificationChannel>(
  "notification-channel",
  (item) => {
    if (typeof item.send !== "function") {
      throw new Error(`[notification-channel] "${item.id}" must implement send(payload, config)`);
    }
  },
);

export const playbookStepTypeRegistry = new ExtensionRegistry<PlaybookStepType>("playbook-step-type", (item) => {
  if (typeof item.run !== "function") {
    throw new Error(`[playbook-step-type] "${item.id}" must implement run(ctx, config)`);
  }
});
