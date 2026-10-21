#!/usr/bin/env node
/**
 * npm run i18n:check
 *
 * Fails the build when:
 *  1. Any message key exists in one locale but not the other (missing or
 *     orphaned keys) — gate: 100% key coverage both locales.
 *  2. The ICU parameter set (placeholders, plural/select argument names) of
 *     a key differs between locales — catches translations that silently
 *     drop a `{name}` or add one that no caller provides.
 *  3. A message fails to actually parse/format with IntlMessageFormat in
 *     each locale (proves the catalog is not just structurally present but
 *     renders) — sample engine strings are rendered in both locales and
 *     printed to stdout as the evidence artifact for the acceptance gate.
 *  4. Source files contain unparameterized concatenation patterns around
 *     translation calls (e.g. `t("x") + variable` or sentence-building via
 *     template literals that splice two separate `t(...)` results
 *     together), which breaks word order in languages like Danish.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntlMessageFormat } from "intl-messageformat";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCALES = ["en-US", "da-DK"];
const messagesByLocale = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"))]),
);

let failed = false;
const log = (msg) => console.log(msg);
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};

function flatten(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, fullKey));
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

const flattened = Object.fromEntries(LOCALES.map((locale) => [locale, flatten(messagesByLocale[locale])]));

// ---- 1. Key coverage parity ------------------------------------------------
const [baseLocale, ...otherLocales] = LOCALES;
const baseKeys = new Set(Object.keys(flattened[baseLocale]));
let totalKeys = baseKeys.size;

for (const locale of otherLocales) {
  const keys = new Set(Object.keys(flattened[locale]));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const orphaned = [...keys].filter((k) => !baseKeys.has(k));
  for (const key of missing) fail(`Missing key in ${locale}: "${key}"`);
  for (const key of orphaned) fail(`Orphaned key in ${locale} (not in ${baseLocale}): "${key}"`);
  totalKeys = Math.max(totalKeys, keys.size);
}

// ---- 2. ICU parameter parity ------------------------------------------------
function collectArgNames(nodes, params) {
  for (const node of nodes ?? []) {
    switch (node.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        params.add(node.value);
        break;
      case TYPE.select:
      case TYPE.plural: {
        params.add(node.value);
        for (const option of Object.values(node.options)) {
          collectArgNames(option.value, params);
        }
        break;
      }
      case TYPE.tag:
        collectArgNames(node.children, params);
        break;
      default:
        break;
    }
  }
  return params;
}

/** Uses the real ICU AST (not a regex) so select/plural option labels like
 * `{level, select, high {høj} other {lav}}` never get mistaken for
 * parameters — only the true argument names (`level`) are collected. */
function extractParams(message) {
  if (typeof message !== "string") return new Set();
  try {
    const ast = parse(message, { ignoreTag: true });
    return collectArgNames(ast, new Set());
  } catch {
    return new Set();
  }
}

for (const key of baseKeys) {
  const paramSets = LOCALES.map((locale) => extractParams(flattened[locale][key]));
  const [first, ...rest] = paramSets;
  rest.forEach((set, idx) => {
    const locale = LOCALES[idx + 1];
    const missing = [...first].filter((p) => !set.has(p));
    const extra = [...set].filter((p) => !first.has(p));
    if (missing.length) fail(`"${key}" in ${locale} is missing parameters: ${missing.join(", ")}`);
    if (extra.length) fail(`"${key}" in ${locale} has unexpected extra parameters: ${extra.join(", ")}`);
  });
}

// ---- 3. Live ICU render of representative engine + UI strings --------------
const SAMPLE_RENDERS = [
  { key: "engine.briefing.attritionRisk", values: { name: "Mette Jensen", level: "high", reasonCount: 3, period: "quarter" } },
  { key: "engine.briefing.engagementDrop", values: { name: "Lars Nielsen", points: 12, sinceRelative: "30 days ago" } },
  { key: "engine.finding.missedOneOnOnes", values: { name: "Freja Holm", count: 2, days: 30 } },
  { key: "engine.playbook.stayInterview", values: { name: "Freja Holm", days: 1 } },
  { key: "engine.narrative.executiveSummary", values: { orgName: "Nordvind A/S", atRiskCount: 4, period: "quarter" } },
  { key: "subjects.listSubtitle", values: { count: 1 } },
  { key: "pwa.queuedBanner", values: { count: 3 } },
];

log("\nSample renders (proof the catalog actually formats, not just parses as JSON):\n");
for (const sample of SAMPLE_RENDERS) {
  for (const locale of LOCALES) {
    const message = flattened[locale][sample.key];
    if (message === undefined) continue; // already reported above
    try {
      const mf = new IntlMessageFormat(message, locale);
      const rendered = mf.format(sample.values);
      log(`  [${locale}] ${sample.key} -> ${rendered}`);
    } catch (err) {
      fail(`"${sample.key}" in ${locale} failed to render: ${err.message}`);
    }
  }
}

// ---- 4. Unparameterized concatenation lint ---------------------------------
const SOURCE_DIRS = ["src"];
const CONCAT_PATTERNS = [
  // `t("a") + t("b")` or `t("a") + variable` — breaks word order across locales.
  { re: /\bt\([^)]*\)\s*\+\s*/g, description: "string concatenation immediately after a t(...) call" },
  { re: /\+\s*t\(/g, description: "string concatenation immediately before a t(...) call" },
  // Template literal splicing two translation calls together, e.g. `${t('a')} ${t('b')} ${name}`
  { re: /\$\{t\([^}]*\)\}\s*\$\{t\(/g, description: "template literal joining two separate t(...) calls" },
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const sourceFiles = SOURCE_DIRS.flatMap((d) => walk(path.join(root, d)));
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const pattern of CONCAT_PATTERNS) {
    if (pattern.re.test(content)) {
      fail(`${path.relative(root, file)}: possible ${pattern.description}. Use a single parameterized message instead.`);
    }
  }
}

// ---- Summary ----------------------------------------------------------------
log(`\nChecked ${totalKeys} keys across ${LOCALES.length} locales (${LOCALES.join(", ")}).`);
log(`Scanned ${sourceFiles.length} source files for concatenation anti-patterns.`);

if (failed) {
  console.error("\ni18n:check FAILED\n");
  process.exit(1);
} else {
  log("\ni18n:check PASSED — 100% key coverage, ICU parameter parity, and no concatenation anti-patterns found.\n");
}
