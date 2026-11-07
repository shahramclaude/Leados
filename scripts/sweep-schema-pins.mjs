#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical schema-pin sweep for the
 * v114 → v115 bump (ADR-0122, Session 167).
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, 114            → SCHEMA_VERSION, 115
 *   schemaVersion, 114             → schemaVersion, 115
 *   '113 → 114']                   → '113 → 114', '114 → 115']   (migration chains)
 *   .at(-1), '112 → 113', '113 → 114' → .at(-1), '114 → 115'    (the whole-chain
 *                                    pin; the old expected value was wrong —
 *                                    the chain always ran to the current schema)
 *
 * The `.at(-1)` form was asserting the SECOND-to-last step as the expected value
 * (a pre-existing bug: `assert.equal(actual, expected, message)` had the
 * expected and message swapped). The sweep corrects it to the current last
 * step, which is what the message already claims.
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
  out = out.replace(/SCHEMA_VERSION, 114/g, () => { n++; return 'SCHEMA_VERSION, 115'; });
  out = out.replace(/schemaVersion, 114/g, () => { n++; return 'schemaVersion, 115'; });
  out = out.replace(new RegExp(`'113 ${ARROW} 114']`, 'g'), () => { n++; return `'113 ${ARROW} 114', '114 ${ARROW} 115']`; });
  // The whole-chain pin: actual=applied.at(-1), expected was wrongly '112 → 113'.
  out = out.replace(new RegExp(`applied.at\\(-1\\), '112 ${ARROW} 113', '113 ${ARROW} 114'`, 'g'), () => { n++; return `applied.at(-1), '114 ${ARROW} 115'`; });
  out = out.replace(new RegExp(`applied.at\\(-1\\), '112 ${ARROW} 113', '113 ${ARROW} 114'\\)`, 'g'), () => { n++; return `applied.at(-1), '114 ${ARROW} 115')`; });
  // Stale whole-chain pins: expected value frozen at an old last step.
  out = out.replace(new RegExp(`applied\\.at\\(-1\\), '108 ${ARROW} 109'`, 'g'), () => { n++; return `applied.at(-1), '114 ${ARROW} 115'`; });
  // Stale normalized-state pins: assert.equal(x.schemaVersion, 112) → 115.
  out = out.replace(/schemaVersion, 112\)/g, () => { n++; return 'schemaVersion, 115)'; });
  // Stale chain ending frozen below the current schema (board-room ends at 111 → 112).
  out = out.replace(new RegExp(`'111 ${ARROW} 112']`, 'g'), () => { n++; return `'111 ${ARROW} 112', '112 ${ARROW} 113', '113 ${ARROW} 114', '114 ${ARROW} 115']`; });
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files`);
console.log(changed.join('\n'));
