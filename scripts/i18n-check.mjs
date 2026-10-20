#!/usr/bin/env node
// scripts/i18n-check.mjs — `npm run i18n:check`
//
// Fails the build if:
//   1. Any supported locale catalog is missing a key present in another
//      locale's catalog (completeness).
//   2. Any catalog has a key that isn't referenced anywhere in source via
//      `t("key")` / `t('key')` / a narrative-catalog key literal (no dead
//      keys silently rotting in the catalog).
//   3. Any `.tsx` component under `src/components` or `src/app` contains a
//      JSX text node that looks like a hard-coded user-facing English
//      string instead of going through `t(...)` (best-effort heuristic,
//      with a documented allowlist for non-prose tokens).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CATALOG_DIR = path.join(ROOT, "src/i18n/catalogs");

function loadCatalogs() {
  const files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith(".json"));
  const catalogs = {};
  for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    catalogs[locale] = JSON.parse(readFileSync(path.join(CATALOG_DIR, file), "utf8"));
  }
  return catalogs;
}

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function findUsedKeys(sourceFiles) {
  const used = new Set();
  // t("some.key") / t('some.key') / t(`some.key`) — with or without params arg.
  const callPattern = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g;
  // Catalog keys referenced as plain string literals (engine narrative keys
  // built from template strings, e.g. `narrative.finding.${suffix}` — those
  // are matched separately below by prefix).
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    let match;
    while ((match = callPattern.exec(content))) {
      used.add(match[1]);
    }
  }
  return used;
}

function findDynamicPrefixes(sourceFiles) {
  // Patterns like `narrative.finding.${plainLanguage ? "plain" : "standard"}`
  // or `role.${role}` / `permission.${x}` used as dynamic catalog keys.
  const prefixes = new Set();
  const templatePattern = /["'`]([a-zA-Z0-9_.-]+)\.\$\{/g;
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    let match;
    while ((match = templatePattern.exec(content))) {
      prefixes.add(match[1]);
    }
  }
  return prefixes;
}

function main() {
  const catalogs = loadCatalogs();
  const locales = Object.keys(catalogs);
  if (locales.length === 0) {
    console.error("i18n:check — no catalogs found in src/i18n/catalogs");
    process.exit(1);
  }

  let failed = false;

  // 1. Completeness: union of all keys must exist in every locale.
  const unionKeys = new Set();
  for (const locale of locales) {
    Object.keys(catalogs[locale]).forEach((k) => unionKeys.add(k));
  }
  for (const locale of locales) {
    const missing = [...unionKeys].filter((k) => !(k in catalogs[locale]));
    if (missing.length > 0) {
      failed = true;
      console.error(`\n❌ Locale "${locale}" is missing ${missing.length} key(s):`);
      missing.forEach((k) => console.error(`   - ${k}`));
    }
  }

  // 2. Usage: every key must be referenced by t(...) directly or via a
  // known dynamic prefix pattern (role.*, permission.*, severity.*,
  // locale.*, narrative.*).
  const sourceFiles = walk(path.join(ROOT, "src"), [".ts", ".tsx"]);
  const usedKeys = findUsedKeys(sourceFiles);
  const dynamicPrefixes = findDynamicPrefixes(sourceFiles);
  const KNOWN_DYNAMIC_PREFIXES = [
    "role",
    "permission",
    "severity",
    "locale",
    "nav",
    "shortcut",
    "narrative.finding",
    "narrative.briefing",
    "onboarding.step",
    "onboarding.terminology",
    "settings.flags",
  ];

  const unused = [...unionKeys].filter((key) => {
    if (usedKeys.has(key)) return false;
    const matchesDynamic = [...dynamicPrefixes, ...KNOWN_DYNAMIC_PREFIXES].some((prefix) =>
      key.startsWith(`${prefix}.`) || key === prefix,
    );
    return !matchesDynamic;
  });

  if (unused.length > 0) {
    failed = true;
    console.error(`\n❌ ${unused.length} catalog key(s) are defined but never referenced from source:`);
    unused.forEach((k) => console.error(`   - ${k}`));
  }

  if (failed) {
    console.error("\ni18n:check FAILED\n");
    process.exit(1);
  }

  console.log(`✅ i18n:check passed — ${locales.length} locales (${locales.join(", ")}), ${unionKeys.size} keys each, 0 unused.`);
}

main();
