#!/usr/bin/env node
/**
 * scripts/check-canonical-boundary.mjs — Enforces ADR-0006 & ADR-0007
 * architectural invariants across the canonical zero-build application:
 *
 *  1. Zero imports or references from `index.html`, `app/**`, `scripts/serve.mjs`,
 *     or `tests/app/*.test.mjs` into quarantined legacy trees (`src/`,
 *     `deprecated/`, `.next/`, or `.ts`/`.tsx` files).
 *  2. Zero bare npm module specifiers inside `app/**` (every static or dynamic
 *     ES import in `app/**` must be a relative `./` or `../` `.js` path so the
 *     browser runs natively without a bundler).
 *  3. Zero outbound network calls (`fetch(`, `XMLHttpRequest`, `WebSocket`,
 *     `EventSource`, `navigator.sendBeacon`) in `app/**` code (comments stripped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkJsFiles(dir, predicate = (f) => f.endsWith('.js') || f.endsWith('.mjs')) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full, predicate));
    else if (entry.isFile() && predicate(entry.name)) out.push(full);
  }
  return out.sort();
}

/** Strip block and line comments plus string literals when checking global API tokens. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1 ');
}

function extractImportSpecifiers(source) {
  const cleaned = stripComments(source);
  const specs = [];
  const staticRe = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = staticRe.exec(cleaned)) !== null) specs.push(m[1]);
  while ((m = dynamicRe.exec(cleaned)) !== null) specs.push(m[1]);
  return specs;
}

export function auditCanonicalBoundary(rootDir = ROOT) {
  const violations = [];
  const appDir = path.join(rootDir, 'app');
  const testsAppDir = path.join(rootDir, 'tests', 'app');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const serveScriptPath = path.join(rootDir, 'scripts', 'serve.mjs');

  const appFiles = walkJsFiles(appDir, (f) => f.endsWith('.js'));
  const testFiles = walkJsFiles(testsAppDir, (f) => f.endsWith('.mjs') || f.endsWith('.js'));

  // 1. Check index.html references
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  if (/(?:src|href)\s*=\s*["'](?:\.?\/)?(?:src|deprecated|\.next)\//i.test(indexHtml)) {
    violations.push('index.html references a quarantined non-canonical path (src/, deprecated/, or .next/).');
  }
  if (!/<script\s+type=["']module["']\s+src=["']\.?\/?app\/main\.js["']/i.test(indexHtml)) {
    violations.push('index.html must load ./app/main.js as its canonical ES module entry point.');
  }

  // 2. Check every canonical app/** module
  const networkRe = /\b(?:fetch\s*\(|new\s+XMLHttpRequest\b|new\s+WebSocket\b|new\s+EventSource\b|navigator\.sendBeacon\s*\()/;
  for (const file of appFiles) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const raw = fs.readFileSync(file, 'utf8');
    const specs = extractImportSpecifiers(raw);

    for (const spec of specs) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        violations.push(`${rel}: bare or non-relative import specifier "${spec}" violates zero-build browser ES module boundary.`);
        continue;
      }
      if (!spec.endsWith('.js')) {
        violations.push(`${rel}: import specifier "${spec}" must end with explicit ".js" extension for native browser module loading.`);
      }
      const target = path.resolve(path.dirname(file), spec);
      const targetRel = path.relative(rootDir, target).replace(/\\/g, '/');
      if (!targetRel.startsWith('app/')) {
        violations.push(`${rel}: import "${spec}" escapes canonical app/ boundary (${targetRel}).`);
      } else if (!fs.existsSync(target)) {
        violations.push(`${rel}: import "${spec}" points to non-existent module (${targetRel}).`);
      }
    }

    // Strip comments and string literals before checking runtime network calls
    const codeOnly = stripComments(raw)
      .replace(/`(?:\\.|[^`\\])*`/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, '""')
      .replace(/"(?:\\.|[^"\\])*"/g, '""');
    if (networkRe.test(codeOnly)) {
      violations.push(`${rel}: contains forbidden outbound network API call (ADR-0006/0007 local-first boundary).`);
    }
  }

  // 3. Check scripts/serve.mjs & tests/app/** do not import quarantined trees
  for (const file of [serveScriptPath, ...testFiles]) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const specs = extractImportSpecifiers(fs.readFileSync(file, 'utf8'));
    for (const spec of specs) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const targetRel = path.relative(rootDir, path.resolve(path.dirname(file), spec)).replace(/\\/g, '/');
        if (
          targetRel.startsWith('src/') ||
          targetRel.startsWith('deprecated/') ||
          targetRel.endsWith('.ts') ||
          targetRel.endsWith('.tsx')
        ) {
          violations.push(`${rel}: imports quarantined non-canonical file "${spec}" (${targetRel}).`);
        }
      } else if (spec.startsWith('@/')) {
        violations.push(`${rel}: imports Next/TS alias "${spec}" from quarantined tree.`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    appModuleCount: appFiles.length,
    canonicalTestCount: testFiles.length,
    violations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditCanonicalBoundary();
  if (!result.ok) {
    console.error('Canonical boundary check FAILED (ADR-0006 / ADR-0007):');
    for (const v of result.violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `Canonical boundary OK — ${result.appModuleCount} app ES modules and ${result.canonicalTestCount} test suites verified with 0 quarantined-tree or network leaks.`,
  );
}
