import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnSync } from 'node:child_process';

import { auditCanonicalBoundary, auditContributorDocs } from '../../scripts/check-canonical-boundary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('ADR-0006 & ADR-0007: canonical app/** has zero legacy-tree imports, zero bare npm specifiers, and zero network calls', () => {
  const report = auditCanonicalBoundary(ROOT);
  assert.equal(report.ok, true, `Boundary violations:\n${report.violations.join('\n')}`);
  assert.deepEqual(report.violations, []);
  assert.ok(report.appModuleCount >= 69, `expected >= 69 canonical ES modules, found ${report.appModuleCount}`);
});

test('ADR-0007: legacy Next.js / Vite quarantine disposition is documented and indexed', () => {
  const adr7Path = path.join(ROOT, 'docs', 'adr', '0007-legacy-next-tree-disposition.md');
  const indexPath = path.join(ROOT, 'docs', 'adr', 'INDEX.md');
  assert.equal(fs.existsSync(adr7Path), true, 'ADR-0007 exists');
  const adr7 = fs.readFileSync(adr7Path, 'utf8');
  assert.match(adr7, /Accepted — 2026-10-25/);
  assert.match(adr7, /FROZEN-NON-CANONICAL/);
  assert.match(adr7, /check-canonical-boundary\.mjs/);

  const indexMd = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexMd, /0007-legacy-next-tree-disposition\.md/);
});

test('ADR-0006/0007: contributor-facing docs describe the canonical app, not the quarantine', () => {
  const report = auditContributorDocs(ROOT);
  assert.equal(report.ok, true, `Documentation violations:\n${report.violations.join('\n')}`);
  assert.deepEqual(report.violations, []);
  assert.ok(report.checks.length >= 20, `expected >= 20 documentation checks, found ${report.checks.length}`);

  // Assert the content directly as well: the audit is only worth trusting if the prose it reads
  // is genuinely free of the instructions that used to send contributors into a database that
  // does not exist here.
  const contributing = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  assert.match(contributing, /npm run app/, 'CONTRIBUTING must give the canonical run command');
  assert.match(contributing, /npm test/, 'CONTRIBUTING must give the canonical test command');
  assert.match(contributing, /app\/views/, 'CONTRIBUTING must describe the canonical tree');
  assert.doesNotMatch(contributing, /db:push/, 'CONTRIBUTING must not resurrect the Postgres quickstart');
  assert.doesNotMatch(contributing, /DATABASE_URL/, 'CONTRIBUTING must not require a database URL');
  assert.doesNotMatch(contributing, /next (dev|build|start)/, 'CONTRIBUTING must not start the quarantined app');
  assert.doesNotMatch(contributing, /localhost:3000|127\.0\.0\.1:3000/, 'CONTRIBUTING must not point at the dead port');
  assert.doesNotMatch(contributing, /no (automated )?test suite/i, 'CONTRIBUTING must not claim the suite does not exist');
});

test('ADR-0007: every quarantined directory carries an in-tree "this is not the app" marker', () => {
  const legacyTrees = fs.readFileSync(path.join(ROOT, 'docs', 'LEGACY-TREES.md'), 'utf8');
  assert.match(legacyTrees, /FROZEN-NON-CANONICAL/);
  for (const frozen of ['src/**', 'deprecated/**', 'scripts/**/*.ts', 'tests/**/*.ts']) {
    assert.ok(legacyTrees.includes(frozen), `LEGACY-TREES.md must inventory ${frozen}`);
  }

  const srcMarker = fs.readFileSync(path.join(ROOT, 'src', 'README.md'), 'utf8');
  assert.match(srcMarker, /NOT THE LEADOS APP/);
  assert.match(srcMarker, /npm run app/, 'the src/ marker must redirect to the real app');
  assert.match(srcMarker, /docs\/LEGACY-TREES\.md/, 'the src/ marker must link the quarantine policy');

  const deprecatedMarker = fs.readFileSync(path.join(ROOT, 'deprecated', 'README.md'), 'utf8');
  assert.match(deprecatedMarker, /Adobe|deprecated/i);
  assert.doesNotMatch(
    deprecatedMarker,
    /canonical (app|application) (is|remains) (the )?Next\.js/i,
    'deprecated/README.md must not claim the Next.js app is canonical',
  );
  assert.match(deprecatedMarker, /docs\/LEGACY-TREES\.md/);
});

test('package.json routes the canonical names at the canonical app and keeps Next.js behind legacy:*', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts;
  for (const name of ['app', 'dev', 'start']) {
    assert.match(scripts[name] || '', /serve\.mjs/, `"${name}" must serve the canonical app`);
  }
  assert.match(scripts.build, /build-standalone\.mjs/, '"build" must build the canonical standalone artefact');
  assert.match(scripts.typecheck, /typecheck-gate\.mjs/, '"typecheck" must be the honest gate, not tsc');
  assert.match(scripts['legacy:dev'], /next dev/, 'the legacy dev server survives only as legacy:dev');
  assert.match(scripts['legacy:typecheck'], /tsc --noEmit/, 'legacy tsc survives only as legacy:typecheck');
  assert.equal(
    Object.keys(scripts).filter((k) => /^legacy:/.test(k)).length >= 4,
    true,
    'the whole legacy toolchain must be namespaced',
  );
});

test('npm run typecheck refuses loudly instead of reporting an empty success', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'typecheck-gate.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, 'the typecheck gate must exit non-zero');
  assert.match(result.stderr, /refuses/);
  assert.match(result.stderr, /check:boundary/, 'it must name the gate that does cover the app');
});

test('docs/INDEX.md separates canonical documentation from the frozen archive', () => {
  const indexMd = fs.readFileSync(path.join(ROOT, 'docs', 'INDEX.md'), 'utf8');
  assert.match(indexMd, /CONTRIBUTING\.md/);
  assert.match(indexMd, /LEGACY-TREES\.md/);
  assert.match(indexMd, /## Archive/, 'the archive must be an explicit, labelled section');
  assert.match(indexMd, /quarantined/i);

  // Entry-point pages that a newcomer would open first must wear the historic banner.
  const bannered = [
    'docs/TESTING.md',
    'docs/CONFIG.md',
    'docs/RUNBOOKS.md',
    'docs/RELEASING.md',
    'docs/MAINTAINER-RUNBOOK.md',
    'docs/tutorials.md',
    'docs/tutorials/first-hour.md',
    'docs/how-to-guides.md',
    'docs/reference.md',
  ];
  for (const rel of bannered) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(text, /Historic — describes the frozen pre-ADR-0006 tree/, `${rel} must state that it is historic`);
    assert.match(text, /LEGACY-TREES\.md/, `${rel} must link the quarantine policy`);
  }
});
