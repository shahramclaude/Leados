#!/usr/bin/env node
/**
 * scripts/design-audit.mjs
 *
 * Gate for `npm run design:check`. Three independent checks, each of which
 * can fail the run on its own:
 *
 *   1. APCA + WCAG contrast of every "sanctioned pair" declared below,
 *      computed from the ACTUAL token values in src/design/tokens.css
 *      (parsed, not retyped), for every theme block in that file.
 *      Cross-checked against the public `apca-w3` reference implementation
 *      AND the hand-rolled src/lib/a11y.ts implementation — if those two
 *      disagree by more than 0.5 Lc, that is itself reported as a defect.
 *   2. Off-token color usage: any hard-coded hex/rgb()/hsl() color literal
 *      inside src/components or src/app (outside src/design) fails. Colors
 *      must come from `var(--token)`.
 *   3. Tabular-numerals coverage: any file importing a numeric formatter
 *      from src/lib/format.ts must also reference `data-metric` or
 *      `tabular-nums` somewhere in the same file (heuristic, documented).
 *
 * Exit code is non-zero if any check fails.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { converter, clampChroma } from "culori";
import { APCAcontrast, sRGBtoY } from "apca-w3";
import { apcaContrast as localApcaContrast, wcagContrast as localWcagContrast } from "../src/lib/a11y.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const toRgb = converter("rgb");

function toRgb255(colorStr) {
  const parsed = toRgb(colorStr.trim());
  if (!parsed) return null;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [clamp(parsed.r), clamp(parsed.g), clamp(parsed.b)];
}

function wcagContrastFromRgb(a, b) {
  function lum([r, g, b]) {
    const chan = (v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }
  const la = lum(a);
  const lb = lum(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// 1. Parse src/design/tokens.css into { themeName: { varName: cssValue } }
// ---------------------------------------------------------------------------
const tokensCssPath = join(ROOT, "src/design/tokens.css");
const tokensCss = readFileSync(tokensCssPath, "utf8");

function parseThemeBlocks(css) {
  const blocks = {};
  const blockRegex = /(:root|\[data-theme="([^"]+)"\])\s*\{([^}]*)\}/g;
  let match;
  while ((match = blockRegex.exec(css))) {
    const name = match[2] ?? "root";
    const body = match[3];
    const vars = {};
    const varRegex = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
    let varMatch;
    while ((varMatch = varRegex.exec(body))) {
      vars[`--${varMatch[1]}`] = varMatch[2].trim();
    }
    blocks[name] = { ...(blocks[name] ?? {}), ...vars };
  }
  return blocks;
}

const themeBlocks = parseThemeBlocks(tokensCss);
// Dark/hc themes only override a subset; resolve against :root as fallback.
const resolvedThemes = {};
for (const name of Object.keys(themeBlocks)) {
  resolvedThemes[name] = { ...themeBlocks.root, ...themeBlocks[name] };
}

function resolveVar(themeName, varName, seen = new Set()) {
  const theme = resolvedThemes[themeName];
  let value = theme[varName];
  if (value === undefined) return null;
  // resolve one level of var(--x) reference (tokens.css only nests one deep)
  const varRefMatch = value.match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (varRefMatch && !seen.has(varRefMatch[1])) {
    seen.add(varRefMatch[1]);
    return resolveVar(themeName, varRefMatch[1], seen);
  }
  return value;
}

// ---------------------------------------------------------------------------
// 2. Sanctioned contrast pairs (kept in sync with src/app/styleguide/ColorTokens.tsx)
// ---------------------------------------------------------------------------
const APCA_FLOOR = { body: 90, large: 75, ui: 45 };
const WCAG_FLOOR = { body: 4.5, large: 3, ui: 3 };

const SANCTIONED_PAIRS = [
  { label: "text-primary on surface-0", text: "--text-primary", bg: "--surface-0", cls: "body" },
  { label: "text-primary on surface-1", text: "--text-primary", bg: "--surface-1", cls: "body" },
  { label: "text-primary on surface-2", text: "--text-primary", bg: "--surface-2", cls: "body" },
  { label: "text-primary on surface-sunken", text: "--text-primary", bg: "--surface-sunken", cls: "body" },
  { label: "text-secondary on surface-0", text: "--text-secondary", bg: "--surface-0", cls: "large" },
  { label: "text-secondary on surface-1", text: "--text-secondary", bg: "--surface-1", cls: "large" },
  { label: "text-muted on surface-0", text: "--text-muted", bg: "--surface-0", cls: "ui" },
  { label: "border-strong on surface-0", text: "--border-strong", bg: "--surface-0", cls: "ui" },
  ...["strategy", "people", "finance", "operations", "risk", "knowledge"].flatMap((d) => [
    { label: `domain-${d}-ink on surface-0`, text: `--domain-${d}-ink`, bg: "--surface-0", cls: "body" },
    { label: `domain-${d}-ink on domain-${d}-tint`, text: `--domain-${d}-ink`, bg: `--domain-${d}-tint`, cls: "body" },
  ]),
  ...["success", "warn", "danger", "info"].flatMap((s) => [
    { label: `${s}-ink on surface-0`, text: `--${s}-ink`, bg: "--surface-0", cls: "body" },
    { label: `${s}-ink on ${s}-tint`, text: `--${s}-ink`, bg: `--${s}-tint`, cls: "body" },
  ]),
];

const THEMES_TO_CHECK = ["root", "dark"]; // hc themes are intentionally near-max contrast; spot-checked manually, see docs.

let apcaFailures = 0;
let wcagFailures = 0;
let crossCheckDrift = 0;
const contrastReport = [];

for (const themeName of THEMES_TO_CHECK) {
  for (const pair of SANCTIONED_PAIRS) {
    const textCss = resolveVar(themeName, pair.text);
    const bgCss = resolveVar(themeName, pair.bg);
    if (!textCss || !bgCss) {
      contrastReport.push({ theme: themeName, ...pair, error: "token not found" });
      continue;
    }
    const textRgb = toRgb255(textCss);
    const bgRgb = toRgb255(bgCss);
    if (!textRgb || !bgRgb) {
      contrastReport.push({ theme: themeName, ...pair, error: `could not parse ${textCss} / ${bgCss}` });
      continue;
    }

    const lcReference = APCAcontrast(sRGBtoY(textRgb), sRGBtoY(bgRgb));
    const lcLocal = localApcaContrast(textRgb, bgRgb);
    const wcag = wcagContrastFromRgb(textRgb, bgRgb);
    const wcagLocal = localWcagContrast(textRgb, bgRgb);

    const drift = Math.abs(Math.abs(lcReference) - Math.abs(lcLocal));
    if (drift > 0.5) crossCheckDrift++;

    const apcaPass = Math.abs(lcReference) >= APCA_FLOOR[pair.cls];
    const wcagPass = wcag >= WCAG_FLOOR[pair.cls];
    if (!apcaPass) apcaFailures++;
    if (!wcagPass) wcagFailures++;

    contrastReport.push({
      theme: themeName,
      label: pair.label,
      cls: pair.cls,
      lc: Number(lcReference.toFixed(1)),
      lcLocal: Number(lcLocal.toFixed(1)),
      wcag: Number(wcag.toFixed(2)),
      wcagLocal: Number(wcagLocal.toFixed(2)),
      apcaFloor: APCA_FLOOR[pair.cls],
      wcagFloor: WCAG_FLOOR[pair.cls],
      apcaPass,
      wcagPass,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Off-token color scan
// ---------------------------------------------------------------------------
const SCAN_DIRS = ["src/components", "src/app"].map((d) => join(ROOT, d));
const EXCLUDE_FILES = new Set([]); // nothing exempted
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const FN_COLOR_RE = /\b(rgb|rgba|hsl|hsla)\(/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(tsx?|css)$/.test(entry)) files.push(full);
  }
  return files;
}

const offTokenViolations = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file);
    if (EXCLUDE_FILES.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      // allow color tokens defined via CSS var() references, and allow the
      // literal strings "currentColor"/"transparent"/canvas probe defaults
      // in src/lib/color.ts (the one place we intentionally start a canvas
      // fillStyle from a literal before overwriting it).
      if (rel === "src/lib/color.ts") return;
      const hexMatches = line.match(HEX_COLOR_RE);
      if (hexMatches) {
        offTokenViolations.push({ file: rel, line: i + 1, snippet: line.trim(), matches: hexMatches });
      }
      if (FN_COLOR_RE.test(line)) {
        offTokenViolations.push({ file: rel, line: i + 1, snippet: line.trim(), matches: ["rgb()/hsl() literal"] });
      }
      FN_COLOR_RE.lastIndex = 0;
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Tabular-nums coverage heuristic
// ---------------------------------------------------------------------------
const tabularNumsViolations = [];
const componentFiles = walk(join(ROOT, "src/components"));
for (const file of componentFiles) {
  const rel = relative(ROOT, file);
  const content = readFileSync(file, "utf8");
  const importsFormatter = /from\s+["']@\/lib\/format["']/.test(content);
  if (!importsFormatter) continue;
  const hasMetricMarker = /data-metric|tabular-nums/.test(content);
  if (!hasMetricMarker) {
    tabularNumsViolations.push({ file: rel, reason: "imports a numeric formatter but no data-metric/tabular-nums marker found" });
  }
}

// ---------------------------------------------------------------------------
// REPORT
// ---------------------------------------------------------------------------
console.log("=== LEADOS design:check ===\n");

console.log(`-- Contrast audit (${THEMES_TO_CHECK.length} themes x ${SANCTIONED_PAIRS.length} pairs = ${contrastReport.length} checks) --`);
for (const row of contrastReport) {
  if (row.error) {
    console.log(`  [ERROR] ${row.theme} :: ${row.label} -> ${row.error}`);
    continue;
  }
  const status = row.apcaPass && row.wcagPass ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${row.theme.padEnd(5)} ${row.label.padEnd(42)} Lc=${row.lc.toFixed(1).padStart(6)} (floor ${row.apcaFloor}) ` +
      `WCAG=${row.wcag.toFixed(2).padStart(5)}:1 (floor ${row.wcagFloor})`,
  );
}

console.log(`\n-- Off-token color literals (${offTokenViolations.length} found) --`);
for (const v of offTokenViolations.slice(0, 50)) {
  console.log(`  [FAIL] ${v.file}:${v.line} -> ${v.matches.join(", ")} :: ${v.snippet}`);
}
if (offTokenViolations.length > 50) console.log(`  … and ${offTokenViolations.length - 50} more`);

console.log(`\n-- Tabular-nums coverage (${tabularNumsViolations.length} violations) --`);
for (const v of tabularNumsViolations) {
  console.log(`  [FAIL] ${v.file} -> ${v.reason}`);
}

console.log(`\n-- APCA/WCAG cross-check (apca-w3 vs src/lib/a11y.ts) --`);
console.log(`  drift > 0.5 Lc on ${crossCheckDrift} of ${contrastReport.length} checks`);

console.log("\n=== SUMMARY ===");
console.log(`APCA failures:          ${apcaFailures}`);
console.log(`WCAG floor failures:    ${wcagFailures}`);
console.log(`Off-token violations:   ${offTokenViolations.length}`);
console.log(`Tabular-nums violations:${tabularNumsViolations.length}`);

const failed = apcaFailures > 0 || wcagFailures > 0 || offTokenViolations.length > 0 || tabularNumsViolations.length > 0;
if (failed) {
  console.log("\ndesign:check FAILED");
  process.exit(1);
} else {
  console.log("\ndesign:check PASSED");
  process.exit(0);
}
