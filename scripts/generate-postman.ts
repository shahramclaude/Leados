/**
 * Generates postman-collection.json from the same route registry used for
 * the OpenAPI spec and the SDK. Run with: npx tsx scripts/generate-postman.ts
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { routeRegistry } from "../src/lib/api/spec";

type PostmanItem = {
  name: string;
  request: {
    method: string;
    header: { key: string; value: string }[];
    url: { raw: string; host: string[]; path: string[]; query?: { key: string; value: string }[] };
    body?: { mode: "raw"; raw: string; options: { raw: { language: "json" } } };
  };
};

function examplePlaceholder(path: string) {
  return path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, p) => `{{${p}}}`);
}

const items: PostmanItem[] = routeRegistry.map((route) => {
  const urlPath = `api${examplePlaceholder(route.path)}`;
  const headers = [{ key: "Authorization", value: "Bearer {{apiKey}}" }];
  if (route.body) headers.push({ key: "Content-Type", value: "application/json" });
  if (route.idempotent) headers.push({ key: "Idempotency-Key", value: "{{$guid}}" });

  return {
    name: `${route.method} ${route.path}`,
    request: {
      method: route.method,
      header: headers,
      url: { raw: `{{baseUrl}}/${urlPath}`, host: ["{{baseUrl}}"], path: urlPath.split("/") },
      ...(route.body ? { body: { mode: "raw" as const, raw: "{}", options: { raw: { language: "json" as const } } } } : {}),
    },
  };
});

const collection = {
  info: {
    _postman_id: randomUUID(),
    name: "LEADOS API (v1)",
    description: "Generated from src/lib/api/spec.ts. See docs/API.md for the full guide.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000" },
    { key: "apiKey", value: "" },
  ],
  item: items,
};

fs.writeFileSync(path.resolve(__dirname, "../postman-collection.json"), JSON.stringify(collection, null, 2) + "\n");
console.log(`[api:gen] wrote postman-collection.json with ${items.length} requests.`);
