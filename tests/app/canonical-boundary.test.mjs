import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditCanonicalBoundary } from '../../scripts/check-canonical-boundary.mjs';

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
