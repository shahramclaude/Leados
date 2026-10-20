// Generates postman-collection.json straight from api-spec.json. Never
// hand-edit the collection — change the zod schemas / registry and
// regenerate via: npx tsx scripts/generate-openapi.ts && npx tsx scripts/generate-postman.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
  requestBody?: { content?: Record<string, { schema?: unknown; example?: unknown }> };
  parameters?: { name: string; in: string; required?: boolean; schema?: { type?: string } }[];
}

interface OpenApiDocument {
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
}

function exampleBodyFor(path: string, method: string): Record<string, unknown> | undefined {
  if (path === "/api/v1/decisions" && method === "post") {
    return { title: "Adopt the new pricing tier", status: "open", owner: "vp-sales" };
  }
  if (path === "/api/v1/findings" && method === "post") {
    return { summary: "Churn risk detected in enterprise segment", severity: "warning" };
  }
  if (path === "/api/v1/runs" && method === "post") {
    return { type: "digest_summary", input: {} };
  }
  if (path === "/api/v1/webhooks/subscriptions" && method === "post") {
    return { url: "https://example.com/webhooks/leados", eventTypes: ["decision.created", "run.completed"] };
  }
  if (path === "/api/v1/integrations/slack/notify" && method === "post") {
    return { message: "LEADOS: new critical finding raised" };
  }
  if (path === "/api/v1/tokens" && method === "post") {
    return { orgId: "org_demo", name: "CI token", scopes: ["read", "write", "automation", "webhooks", "realtime"] };
  }
  return undefined;
}

function main() {
  const root = path.resolve(__dirname, "..");
  const document = JSON.parse(readFileSync(path.join(root, "api-spec.json"), "utf8")) as OpenApiDocument;

  const items = Object.entries(document.paths).flatMap(([routePath, methods]) =>
    Object.entries(methods).map(([method, op]) => {
      const pathParams = (op.parameters ?? []).filter((p) => p.in === "path");
      let urlPath = routePath;
      const pathVariables = pathParams.map((p) => {
        urlPath = urlPath.replace(`{${p.name}}`, `:${p.name}`);
        return { key: p.name, value: "REPLACE_ME" };
      });

      const body = exampleBodyFor(routePath, method);
      const needsAuth = Boolean(op.security?.length);

      return {
        name: `${method.toUpperCase()} ${routePath}`,
        request: {
          method: method.toUpperCase(),
          header: [
            { key: "Content-Type", value: "application/json" },
            ...(needsAuth ? [{ key: "Authorization", value: "Bearer {{leados_token}}" }] : []),
          ],
          url: {
            raw: `{{baseUrl}}${urlPath}`,
            host: ["{{baseUrl}}"],
            path: urlPath.split("/").filter(Boolean),
            ...(pathVariables.length ? { variable: pathVariables } : {}),
          },
          description: op.summary ?? op.description ?? "",
          ...(body ? { body: { mode: "raw", raw: JSON.stringify(body, null, 2) } } : {}),
        },
      };
    }),
  );

  const collection = {
    info: {
      name: document.info.title,
      description: document.info.description ?? "",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "baseUrl", value: "http://localhost:3000" },
      { key: "leados_token", value: "lead_sk_replace_with_real_token" },
    ],
    item: items,
  };

  const collectionJson = JSON.stringify(collection, null, 2);
  writeFileSync(path.join(root, "postman-collection.json"), collectionJson, "utf8");
  writeFileSync(path.join(root, "public", "postman-collection.json"), collectionJson, "utf8");
  console.log(`Generated postman-collection.json with ${items.length} requests.`);
}

main();
