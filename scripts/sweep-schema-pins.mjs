#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep, re-pointed at
 * every schema bump. Current target: v154 → v155 (ADR-0195, Session 263).
 * CSV scope count remains 146: ADR-0195 extends the existing Cross-Line Goal
 * Commitment export (#145) rather than creating another publication surface.
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 154            → SCHEMA_VERSION, 155
 *   schemaVersion, 154             → schemaVersion, 155
 *   '153 → 154']                   → '153 → 154', '154 → 155']   (migration chains)
 *
 * Earlier sweeps (v117 → v118, ADR-0129, Session 175) also corrected the
 * `.at(-1)` form of the whole-chain pin: `assert.equal(actual, expected,
 * message)` with the NEW last step inserted into the MESSAGE slot instead of
 * the expected slot, so the assertion compared at(-1) against the
 * SECOND-to-last step and failed. No such pin survives at v154; if one
 * reappears, extend this sweep rather than hand-editing 80 files.
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
  out = out.replace(/SCHEMA_VERSION, 154/g, () => { n++; return 'SCHEMA_VERSION, 155'; });
  out = out.replace(/schemaVersion, 154/g, () => { n++; return 'schemaVersion, 155'; });
  out = out.replace(new RegExp(`'153 ${ARROW} 154']`, 'g'), () => { n++; return `'153 ${ARROW} 154', '154 ${ARROW} 155']`; });
  // The whole-chain pin with the new step in the wrong slot: expected was
  // frozen at '115 → 116' while the message slot carried '116 → 117'.
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
