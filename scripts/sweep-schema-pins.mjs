#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep, re-pointed at
 * every schema bump. Current target: v156 → v157 (ADR-0201, Session 269).
 *
 * ADR-0201 adds a distinct aggregate CSV publication surface (#148), so its
 * additive schema migration changes BOTH the current schema pin and the total
 * descriptor pin. It deliberately touches only test assertions: ADR/docs and
 * source comments explain their own historical version rather than being
 * rewritten as a mechanical side effect.
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 156            → SCHEMA_VERSION, 157
 *   schemaVersion, 156             → schemaVersion, 157
 *   CSV_EXPORTS.length, 147        → CSV_EXPORTS.length, 148
 *   '155 → 156']                   → '155 → 156', '156 → 157']   (migration chains)
 *   .applied.at(-1), '156 → 157'   → .applied.at(-1), '156 → 157'
 *                                      (legacy-to-current head pins)
 *   DEFAULT_POST_COMMIT_RULES.length, 124 → 125  (rule/contract parity pins)
 *
 * Do not use an old sweep after a new migration: it cannot see
 * current pins and may leave the suite asserting a historical release head.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARROW = '→';
const files = fs.readdirSync(path.join(ROOT, 'tests/app'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => path.join(ROOT, 'tests/app', f));

let touched = 0;
const changed = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;
  let n = 0;
  out = out.replace(/SCHEMA_VERSION, 156/g, () => { n += 1; return 'SCHEMA_VERSION, 157'; });
  out = out.replace(/schemaVersion, 156/g, () => { n += 1; return 'schemaVersion, 157'; });
  // `MIGRATIONS['155']` intentionally remains a one-step 155 → 156 check.
  // It is not a current-state schema pin and therefore must not be swept.
  if (path.basename(file) === 'goal-commitment.test.mjs') {
    const historical = "assert.equal(migrated.schemaVersion, 156, 'the one-step historical migration remains v154 → v155; the normal migration chain then advances to v156');";
    const restored = "assert.equal(migrated.schemaVersion, 155, 'the one-step historical migration remains v154 → v155; the normal migration chain then advances to v156');";
    if (out.includes(historical)) { out = out.replace(historical, restored); n -= 1; }
  }
  out = out.replace(/CSV_EXPORTS\.length, 147/g, () => { n += 1; return 'CSV_EXPORTS.length, 148'; });
  out = out.replace(new RegExp(`'155 ${ARROW} 156']`, 'g'), () => { n += 1; return `'155 ${ARROW} 156', '156 ${ARROW} 157']`; });
  // The shared spine's rule total is a current-state pin too: one rule, one
  // contract, and a new governed rule moves both by exactly one.
  out = out.replace(/DEFAULT_POST_COMMIT_RULES\.length, 124/g, () => { n += 1; return 'DEFAULT_POST_COMMIT_RULES.length, 125'; });
  // Some older migration tests assert only the terminal chain entry. They are
  // current-schema pins, not historical one-step migration assertions (such as
  // `MIGRATIONS['155']`), so move this terminal pin too.
  out = out.replace(new RegExp(`\\.applied\\.at\\(-1\\), '155 ${ARROW} 156'`, 'g'), () => { n += 1; return `.applied.at(-1), '156 ${ARROW} 157'`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
