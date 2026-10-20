/**
 * CI gate: every exported HTTP method handler under `src/app/api/**` must
 * have a matching entry in `src/lib/routePermissions.ts`, and every registry
 * entry must point at a route file that actually exports that method. This
 * makes "no route ships without an explicit, reviewed access decision" a
 * structural, automated property of the repo (Part 13 acceptance criterion).
 *
 * Run with: `npm run security:routes`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ROUTE_PERMISSION_REGISTRY } from "../src/lib/routePermissions";

const API_ROOT = join(__dirname, "..", "src", "app", "api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, found);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      found.push(full);
    }
  }
  return found;
}

function filePathToRoutePath(file: string): string {
  const rel = relative(API_ROOT, file).split(sep).slice(0, -1); // drop route.ts
  const segments = rel.map((segment) => segment); // app-router already uses [id] literally
  return `/api/${segments.join("/")}`.replace(/\/$/, "") || "/api";
}

function extractExportedMethods(source: string): string[] {
  const methods: string[] = [];
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(`export\\s+async\\s+function\\s+${method}\\b|export\\s+function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`);
    if (pattern.test(source)) methods.push(method);
  }
  return methods;
}

function main() {
  const files = walk(API_ROOT);
  const discovered: { method: string; path: string; file: string }[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const routePath = filePathToRoutePath(file);
    for (const method of extractExportedMethods(source)) {
      discovered.push({ method, path: routePath, file });
    }
  }

  const problems: string[] = [];

  for (const route of discovered) {
    const entry = ROUTE_PERMISSION_REGISTRY.find(
      (r) => r.method === route.method && r.path === route.path,
    );
    if (!entry) {
      problems.push(
        `MISSING REGISTRY ENTRY: ${route.method} ${route.path} (${relative(process.cwd(), route.file)}) has no entry in src/lib/routePermissions.ts`,
      );
    }
  }

  for (const entry of ROUTE_PERMISSION_REGISTRY) {
    const match = discovered.find((r) => r.method === entry.method && r.path === entry.path);
    if (!match) {
      problems.push(
        `STALE REGISTRY ENTRY: ${entry.method} ${entry.path} is registered but no route file exports that handler.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error("Route permission registry check FAILED:\n");
    for (const p of problems) console.error(` - ${p}`);
    console.error(`\n${discovered.length} route handlers discovered, ${ROUTE_PERMISSION_REGISTRY.length} registry entries.`);
    process.exit(1);
  }

  console.log(
    `Route permission registry check PASSED — ${discovered.length} route handlers, all registered with an explicit access level.`,
  );
}

main();
