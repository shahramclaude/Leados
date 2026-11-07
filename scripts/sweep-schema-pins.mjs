#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep for the
 * v117 → v118 bump (ADR-0129, Session 175).
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 117            → SCHEMA_VERSION, 118
 *   schemaVersion, 117             → schemaVersion, 118
 *   '116 → 117']                   → '116 → 117', '117 → 118']   (migration chains)
 *   applied.at(-1), '115 → 116', '116 → 117'
 *                                  → applied.at(-1), '117 → 118'
 *
 * The `.at(-1)` form is the same pre-existing bug the v114 → v115 sweep
 * documented: `assert.equal(actual, expected, message)` with the NEW last step
 * inserted into the MESSAGE slot instead of the expected slot, so the
 * assertion compared at(-1) against the SECOND-to-last step and failed. The
 * sweep corrects it to the current last step, which is what the trailing
 * message ("the whole chain runs to the current schema") already claims.
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
  out = out.replace(/SCHEMA_VERSION, 117/g, () => { n++; return 'SCHEMA_VERSION, 118'; });
  out = out.replace(/schemaVersion, 117/g, () => { n++; return 'schemaVersion, 118'; });
  out = out.replace(new RegExp(`'116 ${ARROW} 117']`, 'g'), () => { n++; return `'116 ${ARROW} 117', '117 ${ARROW} 118']`; });
  // The whole-chain pin with the new step in the wrong slot: expected was
  // frozen at '115 → 116' while the message slot carried '116 → 117'.
  out = out.replace(new RegExp(`applied\\.at\\(-1\\), '115 ${ARROW} 116', '116 ${ARROW} 117'`, 'g'), () => { n++; return `applied.at(-1), '117 ${ARROW} 118'`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
