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
 *  4. The human-facing entry points tell the truth about the tree: `CONTRIBUTING.md`
 *     onboards to `app/**` and contains no legacy run instructions, `docs/LEGACY-TREES.md`
 *     exists and states the quarantine, and the quarantined directories carry an in-tree
 *     "this is not the app" marker. Code gates alone cannot stop a contributor following
 *     stale docs into a database that does not exist.
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

/**
 * The documentation half of the boundary (ADR-0006/0007, item 4).
 *
 * `CONTRIBUTING.md` used to onboard contributors onto the quarantined Next.js/PostgreSQL tree:
 * `db:push`, `DATABASE_URL`, `npm run dev` on :3000, "no automated test suite". Every one of
 * those instructions was false for this repository, and nothing in CI noticed, because CI only
 * ever looked at code. This audit makes the prose a checked artefact.
 */
export function auditContributorDocs(rootDir = ROOT) {
  const violations = [];
  const checks = [];

  const read = (rel) => {
    const full = path.join(rootDir, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };

  const expectPresent = (rel, required) => {
    const text = read(rel);
    if (text === null) {
      violations.push(`${rel} is missing (${required.map((r) => r.label).join(', ')}).`);
      return '';
    }
    for (const { label, re } of required) {
      checks.push(`${rel} states ${label}`);
      if (!re.test(text)) violations.push(`${rel} must state ${label}.`);
    }
    return text;
  };

  const expectAbsent = (rel, text, forbidden) => {
    for (const { label, re } of forbidden) {
      checks.push(`${rel} rejects ${label}`);
      if (re.test(text)) violations.push(`${rel} still tells contributors to ${label} — that instruction is false for this repository.`);
    }
  };

  const contributing = expectPresent('CONTRIBUTING.md', [
    { label: 'the canonical run command `npm run app`', re: /\bnpm run app\b/ },
    { label: 'the canonical tree `app/`', re: /\bapp\// },
    { label: 'the quarantine page docs/LEGACY-TREES.md', re: /docs\/LEGACY-TREES\.md/ },
    { label: 'the canonical test command `npm test`', re: /\bnpm test\b/ },
  ]);
  expectAbsent('CONTRIBUTING.md', contributing, [
    { label: 'create a PostgreSQL database (`db:push`)', re: /\bdb:push\b/ },
    { label: 'set `DATABASE_URL`', re: /\bDATABASE_URL\b/ },
    { label: 'run the Next.js dev server (`next dev`)', re: /\bnext (?:dev|build|start)\b/ },
    { label: 'open port 3000', re: /localhost:3000|127\.0\.0\.1:3000/ },
    { label: 'there is no automated test suite', re: /no (?:automated )?test suite/i },
  ]);

  const legacyTrees = expectPresent('docs/LEGACY-TREES.md', [
    { label: 'the quarantine marker `FROZEN-NON-CANONICAL`', re: /FROZEN-NON-CANONICAL/ },
    { label: 'the frozen `src/` tree', re: /\bsrc\/\*\*/ },
    { label: 'the frozen `deprecated/` tree', re: /\bdeprecated\/\*\*/ },
    { label: 'the enforcing gate `check:boundary`', re: /check:boundary/ },
    { label: 'the governing decision ADR-0007', re: /adr\/0007-/ },
    { label: 'the canonical app as the product', re: /app\/\*\*/ },
  ]);
  expectAbsent('docs/LEGACY-TREES.md', legacyTrees, [
    { label: 'pretend the quarantine is canonical', re: /canonical (?:app|application) (?:lives|is) (?:in|at|rooted at) `?src\//i },
  ]);

  const srcMarker = read('src/README.md');
  checks.push('src/README.md carries a do-not-use marker');
  if (srcMarker === null) {
    violations.push('src/README.md is missing — the frozen Next.js tree has no in-tree warning.');
  } else {
    if (!/NOT THE LEADOS APP/i.test(srcMarker)) {
      violations.push('src/README.md must open by stating it is NOT the LeadOS app.');
    }
    if (!/docs\/LEGACY-TREES\.md/.test(srcMarker)) {
      violations.push('src/README.md must point readers at docs/LEGACY-TREES.md.');
    }
  }

  const deprecatedMarker = read('deprecated/README.md');
  checks.push('deprecated/README.md does not claim to be canonical');
  if (deprecatedMarker === null) {
    violations.push('deprecated/README.md is missing.');
  } else {
    if (/canonical (?:app|application) (?:is|remains) (?:the )?Next\.js/i.test(deprecatedMarker)) {
      violations.push('deprecated/README.md still claims the canonical app is the Next.js app — contradicted by ADR-0006/0007.');
    }
    if (!/docs\/LEGACY-TREES\.md/.test(deprecatedMarker)) {
      violations.push('deprecated/README.md must point readers at docs/LEGACY-TREES.md.');
    }
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  const canonicalCommands = [
    ['app', /serve\.mjs/],
    ['dev', /serve\.mjs/],
    ['test', /tests\/app/],
    ['check:boundary', /check-canonical-boundary\.mjs/],
  ];
  for (const [name, re] of canonicalCommands) {
    checks.push(`package.json "${name}" runs the canonical app`);
    if (!scripts[name]) violations.push(`package.json is missing the canonical "${name}" script.`);
    else if (!re.test(scripts[name])) {
      violations.push(`package.json "${name}" is "${scripts[name]}" — it must run the canonical app (${re}).`);
    }
  }
  checks.push('package.json keeps the legacy toolchain behind legacy:* names');
  for (const name of ['build', 'start']) {
    if (scripts[name] && /\bnext\b/.test(scripts[name]) && !scripts[`legacy:${name}`]) {
      violations.push(`package.json "${name}" still runs the quarantined Next.js toolchain. Rename it to "legacy:${name}".`);
    }
  }

  return { ok: violations.length === 0, checks, violations };
}

export function auditCanonicalBoundary(rootDir = ROOT) {
  const violations = [];
  const docs = auditContributorDocs(rootDir);
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
    ok: violations.length === 0 && docs.ok,
    appModuleCount: appFiles.length,
    canonicalTestCount: testFiles.length,
    docChecks: docs.checks.length,
    violations: [...violations, ...docs.violations],
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
    `Canonical boundary OK — ${result.appModuleCount} app ES modules, ${result.canonicalTestCount} test suites and ${result.docChecks} documentation checks verified with 0 quarantined-tree, network or stale-onboarding leaks.`,
  );
}
