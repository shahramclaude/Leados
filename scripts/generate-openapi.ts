// Regenerates api-spec.json / api-spec.yaml from the zod schemas in
// src/lib/openapi/*. Run with: npx tsx scripts/generate-openapi.ts
// CI runs this and fails the build if the committed spec is stale (see
// .github/workflows/ci.yml, the "openapi spec is up to date" step).
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { registry } from "../src/lib/openapi/registry";

function buildDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "LEADOS API",
      version: "0.1.0",
      description:
        "Representative slice of the LEADOS API surface (events, findings, decisions, " +
        "automation runs, board packs) used to prove out the Part 11 QE pipeline.",
    },
    servers: [{ url: "/" }],
  });
}

function main() {
  const document = buildDocument();
  const jsonPath = resolve(__dirname, "../api-spec.json");
  const yamlPath = resolve(__dirname, "../api-spec.yaml");
  writeFileSync(jsonPath, JSON.stringify(document, null, 2) + "\n", "utf8");
  writeFileSync(yamlPath, stringify(document), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${jsonPath}\nWrote ${yamlPath}`);
}

main();
