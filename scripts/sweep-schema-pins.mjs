#!/usr/bin/env node
/**
 * scripts/sweep-schema-pins.mjs — mechanical release-pin sweep, re-pointed at
 * every schema bump. Current target: v170 → v171 (ADR-0217, Session 290).
 * ADR-0217 adds CSV scope #159 and one rule on the shared spine, so
 * `spineRules` moves the default post-commit count pin 133 → 134.
 *
 * ADR-0209 adds five new EMPTY collections (workRestShifts, workRestActs,
 * workRestCoverage, workRestPolicies and workRestMarkers), CSV scope #151 and
 * the 128th rule on the shared spine, so its additive migration changes the
 * current schema pin, the migration-chain tails, the export-count pin and the
 * spine-count pin. It deliberately touches only test assertions: ADR/docs and
 * source comments explain their own historical version rather than being
 * rewritten as a mechanical side effect.
 *
 * RE-POINTING IT. Change the three rows of `SWEEP` below and nothing else. Set
 * `csvExports` or `spineRules` to null for a release that adds no export scope
 * or no rule. `from` may list more than one value: Session 277 found the spine
 * count pinned at 125 in seven suites although the spine had held 126 rules
 * since Session 274 — a pin left behind by a sweep that only knew about the
 * schema number. That is why the three counts now move together.
 *
 * Updates, in every tests/app/*.test.mjs:
 *   SCHEMA_VERSION, <from>             → SCHEMA_VERSION, <to>
 *   schemaVersion, <from>              → schemaVersion, <to>
 *   '<from-1> → <from>']               → '<from-1> → <from>', '<from> → <to>']   (migration chains)
 *   .applied.at(-1), '<from-1> → <from>' → .applied.at(-1), '<from> → <to>'
 *                                          (legacy-to-current head pins)
 *   CSV_EXPORTS.length, <from>         → CSV_EXPORTS.length, <to>
 *   DEFAULT_POST_COMMIT_RULES.length, <from> → DEFAULT_POST_COMMIT_RULES.length, <to>
 *
 * One-step historical migration tests keep their OWN from-version (colon form,
 * e.g. `schemaVersion: 156`) and are never swept: they pin a migration that
 * still exists at that key. Their expected tail IS swept, because the chain
 * now continues past them to the current head.
 *
 * ONE-STEP EXPECTATIONS ARE EXEMPT. A test that calls a single step directly
 * (`const next = MIGRATIONS[165](v165)`) asserts what THAT STEP returns — 166,
 * forever — not the current head. Session 288 found `assert.equal(next
 * .schemaVersion, 168)` in standard-waivers.test.mjs, corrupted by the blunt
 * `schemaVersion, <from>` swap two releases earlier (ADR-0210's sweep), which
 * silently turned a historical fact into a false head pin and left the suite
 * red. Such blocks are now detected and skipped, and the historical value was
 * restored by hand. `ids.length, <from>` is swept too: Session 288 found the
 * spine count pinned in that form in work-rest-recovery.test.mjs, which the
 * `DEFAULT_POST_COMMIT_RULES.length` pattern could not see. Positional tail
 * pins (`ids.at(-3)`, `slice(-3)`) remain manual — a new rule shifts them by
 * one and the failure message names the winner.
 *
 * Do not use an old sweep after a new migration: it cannot see
 * current pins and may leave the suite asserting a historical release head.
 */
import fs from 'node:fs';
import path from 'node:path';

const SWEEP = {
  schema: { from: 174, to: 175 },
  csvExports: { from: [162], to: 163 },
  spineRules: { from: [135, 136], to: 137 },
};

const ROOT = path.resolve(import.meta.dirname, '..');
const ARROW = '→';
const files = fs.readdirSync(path.join(ROOT, 'tests/app'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => path.join(ROOT, 'tests/app', f));

const { from, to } = SWEEP.schema;
const previousStep = `${from - 1} ${ARROW} ${from}`;
const newStep = `${from} ${ARROW} ${to}`;

let touched = 0;
const changed = [];
const totals = { schema: 0, chain: 0, csvExports: 0, spineRules: 0 };
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;
  let n = 0;
  const swap = (pattern, replacement, bucket) => {
    out = out.replace(pattern, () => { n += 1; totals[bucket] += 1; return replacement; });
  };
  swap(new RegExp(`SCHEMA_VERSION, ${from}\\b`, 'g'), `SCHEMA_VERSION, ${to}`, 'schema');
  // Split into test blocks so a one-step assertion is never mistaken for a
  // current-head pin. `MIGRATIONS[n](` (a direct, single step) is the marker;
  // the chain is exercised through `migrate(...)`.
  out = out.split(/^(?=test\()/m).map((block) => {
    if (/MIGRATIONS\[\s*['"]?\d+['"]?\s*\]\s*\(/.test(block)) return block;
    return block.replace(new RegExp(`schemaVersion, ${from}\\b`, 'g'), () => {
      n += 1; totals.schema += 1; return `schemaVersion, ${to}`;
    });
  }).join('');
  swap(new RegExp(`'${previousStep}'\\]`, 'g'), `'${previousStep}', '${newStep}']`, 'chain');
  // Some older migration tests assert only the terminal chain entry. They are
  // current-schema pins, not historical one-step migration assertions (such as
  // `MIGRATIONS['156']`), so move this terminal pin too (and repair any prior
  // comma-appended duplicates).
  swap(/\.applied\.at\(-1\),\s*(?:'\d+\s*→\s*\d+',\s*)*'\d+\s*→\s*\d+'/g, `.applied.at(-1), '${newStep}'`, 'chain');
  for (const stale of SWEEP.csvExports?.from || []) {
    swap(new RegExp(`CSV_EXPORTS\\.length, ${stale}\\b`, 'g'), `CSV_EXPORTS.length, ${SWEEP.csvExports.to}`, 'csvExports');
  }
  for (const stale of SWEEP.spineRules?.from || []) {
    swap(new RegExp(`DEFAULT_POST_COMMIT_RULES\\.length, ${stale}\\b`, 'g'), `DEFAULT_POST_COMMIT_RULES.length, ${SWEEP.spineRules.to}`, 'spineRules');
    swap(new RegExp(`ids\\.length, ${stale}\\b`, 'g'), `ids.length, ${SWEEP.spineRules.to}`, 'spineRules');
  }
  if (out !== src) {
    fs.writeFileSync(file, out);
    touched += 1;
    changed.push(`${path.basename(file)} (${n})`);
  }
}
console.log(`touched ${touched} files — schema pins ${totals.schema}, chain tails ${totals.chain}, export-count pins ${totals.csvExports}, spine-count pins ${totals.spineRules}`);
console.log(changed.join('\n'));
