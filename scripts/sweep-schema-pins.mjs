#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep, re-pointed at
 * every schema bump. Current target: v157 → v158 (ADR-0202, Session 270).
 *
 * ADR-0202 adds no new collection and no new CSV scope (it extends #146), so
 * its additive schema migration changes ONLY the current schema pin and the
 * migration-chain tails. It deliberately touches only test assertions: ADR/docs
 * and source comments explain their own historical version rather than being
 * rewritten as a mechanical side effect.
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 157            → SCHEMA_VERSION, 158
 *   schemaVersion, 157             → schemaVersion, 158
 *   '156 → 157']                   → '156 → 157', '157 → 158']   (migration chains)
 *   .applied.at(-1), '156 → 157'   → .applied.at(-1), '157 → 158'
 *                                      (legacy-to-current head pins)
 *
 * One-step historical migration tests keep their OWN from-version (colon form,
 * e.g. `schemaVersion: 156`) and are never swept: they pin a migration that
 * still exists at that key. Their expected tail IS swept, because the chain
 * now continues past them to the current head.
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
  out = out.replace(/SCHEMA_VERSION, 157/g, () => { n += 1; return 'SCHEMA_VERSION, 158'; });
  out = out.replace(/schemaVersion, 157/g, () => { n += 1; return 'schemaVersion, 158'; });
  out = out.replace(new RegExp(`'156 ${ARROW} 157']`, 'g'), () => { n += 1; return `'156 ${ARROW} 157', '157 ${ARROW} 158']`; });
  // Some older migration tests assert only the terminal chain entry. They are
  // current-schema pins, not historical one-step migration assertions (such as
  // `MIGRATIONS['156']`), so move this terminal pin too.
  out = out.replace(new RegExp(`\\.applied\\.at\\(-1\\), '156 ${ARROW} 157'`, 'g'), () => { n += 1; return `.applied.at(-1), '157 ${ARROW} 158'`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
