// Generates api-spec.yaml / api-spec.json from the zod registry. Run via:
//   npx tsx scripts/generate-openapi.ts
// This is the only supported way to change the spec — never hand-edit the
// generated files.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { buildOpenApiDocument } from "../src/lib/openapi/registry";

function main() {
  const document = buildOpenApiDocument();
  const root = path.resolve(__dirname, "..");
  const yamlStr = stringify(document);
  const jsonStr = JSON.stringify(document, null, 2);

  writeFileSync(path.join(root, "api-spec.yaml"), yamlStr, "utf8");
  writeFileSync(path.join(root, "api-spec.json"), jsonStr, "utf8");

  mkdirSync(path.join(root, "public"), { recursive: true });
  writeFileSync(path.join(root, "public", "api-spec.yaml"), yamlStr, "utf8");
  writeFileSync(path.join(root, "public", "api-spec.json"), jsonStr, "utf8");

  console.log(`Generated api-spec.yaml and api-spec.json with ${Object.keys(document.paths ?? {}).length} paths.`);
}

main();
