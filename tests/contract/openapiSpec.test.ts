// Static contract check: every route file under src/app/api/** has a
// corresponding path registered in the OpenAPI registry, and the committed
// api-spec.json is not stale relative to the zod schemas/registry it's
// generated from. Run `npm run openapi:generate` after changing a schema.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi/registry";

function listRoutePaths(dir: string, prefix = "/api"): string[] {
  const entries = readdirSync(dir);
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const segment = entry.startsWith("[") ? `{${entry.slice(1, -1)}}` : entry;
      paths.push(...listRoutePaths(full, `${prefix}/${segment}`));
    } else if (entry === "route.ts") {
      paths.push(prefix);
    }
  }
  return paths;
}

describe("OpenAPI contract", () => {
  it("every src/app/api/**/route.ts has a registered OpenAPI path", () => {
    const apiDir = join(process.cwd(), "src/app/api");
    const routePaths = listRoutePaths(apiDir).sort();
    const registeredPaths = Object.keys(
      new OpenApiGeneratorV31(registry.definitions).generateDocument({
        openapi: "3.1.0",
        info: { title: "x", version: "0" },
      }).paths ?? {},
    ).sort();

    for (const routePath of routePaths) {
      expect(registeredPaths).toContain(routePath);
    }
  });

  it("the committed api-spec.json is not stale relative to the current registry", () => {
    const generated = new OpenApiGeneratorV31(registry.definitions).generateDocument({
      openapi: "3.1.0",
      info: { title: "LEADOS API", version: "0.1.0" },
      servers: [{ url: "/" }],
    });

    const committedRaw = readFileSync(join(process.cwd(), "api-spec.json"), "utf8");
    const committed = JSON.parse(committedRaw);

    // Compare path sets + component schema names, which is what actually
    // drifts when code changes without regenerating the spec.
    expect(Object.keys(committed.paths).sort()).toEqual(Object.keys(generated.paths ?? {}).sort());
    expect(Object.keys(committed.components.schemas).sort()).toEqual(
      Object.keys(generated.components?.schemas ?? {}).sort(),
    );
  });
});
