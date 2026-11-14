#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep, re-pointed at
 * every schema bump. Current target: v155 → v156 (ADR-0196, Session 264).
 *
 * ADR-0196 adds a distinct aggregate CSV publication surface (#147), so its
 * additive schema migration changes BOTH the current schema pin and the total
 * descriptor pin. It deliberately touches only test assertions: ADR/docs and
 * source comments explain their own historical version rather than being
 * rewritten as a mechanical side effect.
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 155            → SCHEMA_VERSION, 156
 *   schemaVersion, 155             → schemaVersion, 156
 *   CSV_EXPORTS.length, 146        → CSV_EXPORTS.length, 147
 *   '154 → 155']                   → '154 → 155', '155 → 156']   (migration chains)
 *   .applied.at(-1), '151 → 152'   → .applied.at(-1), '155 → 156'
 *                                      (legacy-to-current head pins)
 *
 * Do not use an old v154 → v155 sweep after a new migration: it cannot see
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
  out = out.replace(/SCHEMA_VERSION, 155/g, () => { n += 1; return 'SCHEMA_VERSION, 156'; });
  out = out.replace(/schemaVersion, 155/g, () => { n += 1; return 'schemaVersion, 156'; });
  // `MIGRATIONS['154']` intentionally remains a one-step 154 → 155 check.
  // It is not a current-state schema pin and therefore must not be swept.
  if (path.basename(file) === 'goal-commitment.test.mjs') {
    const historical = "assert.equal(migrated.schemaVersion, 156, 'the one-step historical migration remains v154 → v155; the normal migration chain then advances to v156');";
    const restored = "assert.equal(migrated.schemaVersion, 155, 'the one-step historical migration remains v154 → v155; the normal migration chain then advances to v156');";
    if (out.includes(historical)) { out = out.replace(historical, restored); n -= 1; }
  }
  out = out.replace(/CSV_EXPORTS\.length, 146/g, () => { n += 1; return 'CSV_EXPORTS.length, 147'; });
  out = out.replace(new RegExp(`'154 ${ARROW} 155']`, 'g'), () => { n += 1; return `'154 ${ARROW} 155', '155 ${ARROW} 156']`; });
  // Some older migration tests assert only the terminal chain entry. They are
  // current-schema pins, not historical one-step migration assertions (such as
  // `MIGRATIONS['154']`), so move this audited v152-era terminal pin too.
  out = out.replace(new RegExp(`\\.applied\\.at\\(-1\\), '151 ${ARROW} 152'`, 'g'), () => { n += 1; return `.applied.at(-1), '155 ${ARROW} 156'`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
