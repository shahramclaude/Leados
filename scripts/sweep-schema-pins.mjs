#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep for the
 * v116 → v117 bump (ADR-0128, Session 174).
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 116            → SCHEMA_VERSION, 117
 *   schemaVersion, 116             → schemaVersion, 117
 *   '115 → 116']                   → '115 → 116', '116 → 117']   (migration chains)
 *   applied.at(-1), '114 → 115', '115 → 116'
 *                                  → applied.at(-1), '116 → 117'
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
  out = out.replace(/SCHEMA_VERSION, 116/g, () => { n++; return 'SCHEMA_VERSION, 117'; });
  out = out.replace(/schemaVersion, 116/g, () => { n++; return 'schemaVersion, 117'; });
  out = out.replace(new RegExp(`'115 ${ARROW} 116']`, 'g'), () => { n++; return `'115 ${ARROW} 116', '116 ${ARROW} 117']`; });
  // The whole-chain pin with the new step in the wrong slot: expected was
  // frozen at '114 → 115' while the message slot carried '115 → 116'.
  out = out.replace(new RegExp(`applied\\.at\\(-1\\), '114 ${ARROW} 115', '115 ${ARROW} 116'`, 'g'), () => { n++; return `applied.at(-1), '116 ${ARROW} 117'`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
