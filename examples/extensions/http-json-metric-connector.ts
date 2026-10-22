/**
 * Example extension (Part 16 extension seam demo): a metric connector that
 * fetches an arbitrary JSON endpoint and plucks a numeric field out of it
 * using a dot-path (e.g. "stats.openIssues"). This is a complete, working
 * extension — not a stub — registered through the same typed registry the
 * built-in connectors use (src/lib/extensions/registry.ts).
 *
 * Run the demo with: npx tsx examples/extensions/http-json-metric-connector.ts
 */
import { z } from "zod";
import { metricConnectorRegistry } from "../../src/lib/extensions/registry";
import type { MetricConnector } from "../../src/lib/extensions/types";

const HttpJsonConfig = z.object({
  url: z.string().url(),
  path: z.string().min(1).describe("Dot-path into the JSON response, e.g. 'data.count'"),
  metricName: z.string().default("http_json_value"),
});

function getByPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const httpJsonMetricConnector: MetricConnector<z.infer<typeof HttpJsonConfig>> = {
  id: "http-json",
  version: "1.0.0",
  description: "Fetches a JSON endpoint and extracts a numeric metric by dot-path.",
  configSchema: HttpJsonConfig,
  async fetchMetric(config) {
    const res = await fetch(config.url);
    if (!res.ok) throw new Error(`http-json connector: ${config.url} responded ${res.status}`);
    const body = await res.json();
    const raw = getByPath(body, config.path);
    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new Error(`http-json connector: value at "${config.path}" is not numeric (got ${JSON.stringify(raw)})`);
    }
    return { name: config.metricName, value, ts: new Date().toISOString() };
  },
};

async function demo() {
  metricConnectorRegistry.register(httpJsonMetricConnector);
  console.log("[example] registered extension:", metricConnectorRegistry.require("http-json").id);

  // Demonstrate against the local, unauthenticated ops heartbeat — it returns
  // { routeCount: <number>, ... } so we pluck "routeCount" as the metric.
  const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
  const connector = metricConnectorRegistry.require("http-json");
  const config = connector.configSchema.parse({ url: `${baseUrl}/api/stats`, path: "routeCount", metricName: "api_route_count" });
  const sample = await connector.fetchMetric(config);
  console.log("[example] fetched metric sample:", sample);
}

if (require.main === module) {
  demo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
