#!/usr/bin/env node
// CI gate (Part 17-B): fails the pipeline if any `src/app/api/**/route.ts`
// exports an HTTP method handler that is not present in
// `src/lib/authz/registry.ts`. This is what makes "a new route without a
// registry entry fails the pipeline" literally true rather than aspirational.
//
// Run via `npm run check:routes`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const REGISTRY_FILE = path.join(ROOT, "src", "lib", "authz", "registry.ts");

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      files.push(full);
    }
  }
  return files;
}

function toTemplatePath(routeFile) {
  const relative = path.relative(API_DIR, path.dirname(routeFile));
  const segments = relative.split(path.sep).filter(Boolean);
  const templateSegments = segments.map((seg) => {
    const match = seg.match(/^\[(\.\.\.)?([^\]]+)\]$/);
    return match ? `:${match[2]}` : seg;
  });
  return `/api/${templateSegments.join("/")}`.replace(/\/$/, "") || "/api";
}

const METHOD_RE = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
const FUNC_METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;

function extractMethods(source) {
  const methods = new Set();
  for (const re of [METHOD_RE, FUNC_METHOD_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) methods.add(m[1]);
  }
  return [...methods];
}

function loadRegistryKeys() {
  const source = readFileSync(REGISTRY_FILE, "utf8");
  const entryRe = /\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)"\s*,\s*path:\s*"([^"]+)"/g;
  const keys = new Set();
  let m;
  while ((m = entryRe.exec(source))) {
    keys.add(`${m[1]} ${m[2]}`);
  }
  return keys;
}

function main() {
  if (!statSync(API_DIR, { throwIfNoEntry: false })) {
    console.log("No src/app/api directory found — nothing to check.");
    return;
  }
  const routeFiles = walk(API_DIR);
  const registryKeys = loadRegistryKeys();
  const missing = [];

  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    const methods = extractMethods(source);
    const templatePath = toTemplatePath(file);
    for (const method of methods) {
      const key = `${method} ${templatePath}`;
      if (!registryKeys.has(key)) {
        missing.push({ key, file: path.relative(ROOT, file) });
      }
    }
  }

  if (missing.length > 0) {
    console.error("\n❌ Route authorization registry check FAILED.\n");
    console.error("The following routes export an HTTP handler but have no entry in");
    console.error("src/lib/authz/registry.ts (ROUTE_REGISTRY). Every route must have an");
    console.error('explicit permission, or "public"/"authenticated" if that is really');
    console.error("intended — this is a deliberate decision, not a default.\n");
    for (const m of missing) {
      console.error(`  - ${m.key}  (${m.file})`);
    }
    console.error("");
    process.exit(1);
  }

  console.log(`✅ Route authorization registry check passed. ${routeFiles.length} route file(s) checked, all methods registered.`);
}

main();
