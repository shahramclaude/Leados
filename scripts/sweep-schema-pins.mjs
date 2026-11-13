#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep, re-pointed at
 * every schema bump. Current target: v153 → v154 (ADR-0194, Session 262),
 * which also moves the CSV scope count pin 145 → 146 (the Chargeback Period
 * Posting export is scope #146).
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 153            → SCHEMA_VERSION, 154
 *   schemaVersion, 153             → schemaVersion, 154
 *   '152 → 153']                   → '152 → 153', '153 → 154']   (migration chains)
 *   CSV_EXPORTS.length, 145        → CSV_EXPORTS.length, 146
 *
 * Earlier sweeps (v117 → v118, ADR-0129, Session 175) also corrected the
 * `.at(-1)` form of the whole-chain pin: `assert.equal(actual, expected,
 * message)` with the NEW last step inserted into the MESSAGE slot instead of
 * the expected slot, so the assertion compared at(-1) against the
 * SECOND-to-last step and failed. No such pin survives at v153; if one
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
  out = out.replace(/SCHEMA_VERSION, 153/g, () => { n++; return 'SCHEMA_VERSION, 154'; });
  out = out.replace(/schemaVersion, 153/g, () => { n++; return 'schemaVersion, 154'; });
  out = out.replace(new RegExp(`'152 ${ARROW} 153']`, 'g'), () => { n++; return `'152 ${ARROW} 153', '153 ${ARROW} 154']`; });
  // The whole-chain pin with the new step in the wrong slot: expected was
  // frozen at '115 → 116' while the message slot carried '116 → 117'.
  out = out.replace(/CSV_EXPORTS\.length, 145/g, () => { n++; return 'CSV_EXPORTS.length, 146'; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
