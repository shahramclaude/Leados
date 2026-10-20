// Contract tests, part 1: every path+method declared in api-spec.json must
// be backed by a real route file under src/app/api that exports that HTTP
// method. This is what "spec is the source of truth" actually buys us: the
// build fails loudly the moment a route and the spec drift apart.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function routeFileFor(apiPath: string): string {
  // /api/v1/decisions/{id} -> src/app/api/v1/decisions/[id]/route.ts
  const segments = apiPath
    .replace(/^\/api\//, "")
    .split("/")
    .map((segment) => (segment.startsWith("{") && segment.endsWith("}") ? `[${segment.slice(1, -1)}]` : segment));
  return path.join("src", "app", "api", ...segments, "route.ts");
}

function main() {
  const root = path.resolve(__dirname, "..");
  const document = JSON.parse(readFileSync(path.join(root, "api-spec.json"), "utf8")) as OpenApiDocument;

  const failures: string[] = [];
  let checked = 0;

  for (const [apiPath, methods] of Object.entries(document.paths)) {
    const file = routeFileFor(apiPath);
    const fullPath = path.join(root, file);

    if (!existsSync(fullPath)) {
      failures.push(`Missing route file for ${apiPath}: expected ${file}`);
      continue;
    }

    const source = readFileSync(fullPath, "utf8");

    for (const method of Object.keys(methods)) {
      if (!HTTP_METHODS.includes(method)) continue;
      checked += 1;
      const exportName = method.toUpperCase();
      const exportRegex = new RegExp(`export\\s+const\\s+${exportName}\\s*=|export\\s+async\\s+function\\s+${exportName}\\s*\\(`);
      if (!exportRegex.test(source)) {
        failures.push(`${apiPath} declares ${exportName} in the spec, but ${file} does not export it`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`Contract test FAILED (${failures.length} issue(s)):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`Contract test passed: ${checked} spec operations all have a matching, exported route handler.`);
}

main();
