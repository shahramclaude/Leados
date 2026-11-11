/**
 * app/core/domain/conventionRegister.js — the Conventions-in-Force Register
 * (ADR-0180, Schema v143 unchanged, Settings & data → "Conventions in force").
 *
 * THE DUTY. The seat that owns the control environment — the chief or VP who
 * declares the matrix tolerance, the disclosure floor, which automatic rule
 * families run — has to be able to answer three questions before trusting any
 * roll-up in front of them:
 *
 *   1. Which conventions is this workspace actually running under, and which of
 *      them are no longer what a new workspace starts with?
 *   2. Which automatic rule families are switched OFF right now? (A paused
 *      matrix fan-out means a second-line manager's view has silently stopped
 *      receiving work. A bypassed control nobody can see is the failure.)
 *   3. Will what I declared still be declared after the next reload?
 *
 * Until this module the third answer was "not for six engines": 30 declared
 * conventions were discarded on every load. The loader now carries them, and
 * this register is the standing proof — it re-runs the loader over the settings
 * in memory on every reading and reports what a reload would do.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *  - It keeps no table of its own. "Default" is what the loader makes of a new
 *    workspace's settings; the switch census is derived from the settings
 *    themselves. A second table would be a second truth.
 *  - It never collapses two failures into one word. "A key the loader would
 *    drop" and "a value the loader would change" are counted and named apart.
 *  - It never prints a text value or the inside of a structured value: those
 *    can hold a name, a seat id or a cost. It prints the kind, whether the
 *    value is set, and whether it differs. Numbers and yes/no values — the
 *    conventions proper — are printed exactly as stored.
 *  - It does not say what a switch gates. It reads the switch, and it names the
 *    switches known — by a test pinned to the source — to gate nothing, and the
 *    rules known to read a switch that cannot be stored.
 *
 * Pure module: no DOM, no storage, no clock. Reading stores nothing.
 */

import { DEFAULT_SETTINGS, normalizeSettings } from '../schema.js';
import {
  CONVENTION_REGISTER_ENGINE_VERSION,
  CONVENTION_REGISTER_METHOD,
  CONVENTION_SWITCH_DEFECTS,
  CONVENTION_VALUE_KINDS,
  isConventionSwitchKey,
} from './conventionRegisterRegistry.js';
import { canonicalJson, printableSettingsKey, settingsLoadReceipt } from './conventionRegisterSchema.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** `{}` or `[]` — a structured value that declares nothing. */
function isEmptyStructure(value) {
  if (Array.isArray(value)) return value.length === 0;
  return isPlainObject(value) && Object.keys(value).length === 0;
}

/** The closed kind of a convention, read from its default and its value. */
function kindOf(key, defaultValue, value) {
  const probe = defaultValue === null || defaultValue === undefined ? value : defaultValue;
  if (typeof probe === 'boolean') return isConventionSwitchKey(key) ? 'switch' : 'flag';
  if (typeof probe === 'number') return 'number';
  if (typeof probe === 'string') return 'text';
  if (probe === null || probe === undefined) return 'unset';
  return 'structured';
}

/**
 * How one value is printed.
 *
 * A number is printed as its JSON text — byte for byte what the store writes.
 * A text value is NEVER printed (it may be a name or an id): only whether it is
 * empty. A structured value prints its size, never its inside.
 */
export function conventionValueText(value, kind) {
  if (value === undefined) return 'absent';
  if (value === null) return 'not set';
  if (typeof value === 'boolean') {
    if (kind === 'switch') return value ? 'on' : 'off';
    return value ? 'yes' : 'no';
  }
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : String(value);
  if (typeof value === 'string') return value === '' ? 'empty' : 'text (not printed)';
  if (Array.isArray(value)) return `structured · ${value.length} item${value.length === 1 ? '' : 's'}`;
  const n = Object.keys(value).length;
  return `structured · ${n} entr${n === 1 ? 'y' : 'ies'}`;
}

/**
 * Build the register for one workspace.
 *
 * `loader` and `newWorkspaceSettings` are injectable only so a test can prove
 * the reload check FAILS when the loader drops or changes something; the app
 * always uses the real loader and the real new-workspace settings.
 */
export function buildConventionRegister(state, { loader = normalizeSettings, newWorkspaceSettings = DEFAULT_SETTINGS } = {}) {
  const memory = isPlainObject(state?.settings) ? state.settings : {};
  // DEFAULT: what a brand-new workspace runs under once loaded.
  const baseline = loader(newWorkspaceSettings);
  // What the loader falls back to when a key is missing from the stored file.
  const missingKey = loader({});
  // IN FORCE: what the loader makes of the settings in memory — for every
  // convention owned by an engine normalizer that is, by construction, the
  // value the engine's own reader returns.
  const reloaded = loader(memory);
  const receipt = settingsLoadReceipt(memory, reloaded);

  const rows = Object.keys(reloaded).sort().map((key) => {
    const present = own(memory, key) && memory[key] !== undefined;
    const defaultValue = baseline[key];
    const inForce = reloaded[key];
    const kind = kindOf(key, defaultValue, inForce);
    const differs = canonicalJson(inForce) !== canonicalJson(defaultValue);
    const sameOnReload = present && canonicalJson(memory[key]) === canonicalJson(inForce);
    // An EMPTY structured value ({} or []) declares nothing: the loader reads
    // it at the default (`DEFAULT_SETTINGS` itself holds two such values). That
    // is counted and printed, and is not a change to anything a human declared.
    const filledFromEmpty = present && !sameOnReload && isEmptyStructure(memory[key]) && !differs;
    const repaired = present && !sameOnReload && !filledFromEmpty;
    const isSwitch = kind === 'switch';
    return {
      key,
      kind,
      kindLabel: CONVENTION_VALUE_KINDS[kind],
      present,
      differs,
      sameOnReload,
      filledFromEmpty,
      repaired,
      isSwitch,
      switchState: !isSwitch ? null : inForce === false ? 'off' : inForce === true ? 'on' : 'indeterminate',
      defaultText: conventionValueText(defaultValue, kind),
      inForceText: conventionValueText(inForce, kind),
      inMemoryText: present ? conventionValueText(memory[key], kind) : 'absent',
    };
  });

  const differing = rows.filter((row) => row.differs);
  const switches = rows.filter((row) => row.isSwitch);
  const off = switches.filter((row) => row.switchState === 'off');
  const on = switches.filter((row) => row.switchState === 'on');
  const indeterminate = switches.filter((row) => row.switchState === 'indeterminate');
  const repaired = rows.filter((row) => row.repaired);
  const present = rows.filter((row) => row.present);

  // Two declared defaults for one convention: a workspace whose stored file
  // lacks the key loads a different number from the one a new workspace starts
  // with. Derived here, so the list cannot go stale; pinned by test.
  const fallbackDisagreements = Object.keys(baseline).sort()
    .filter((key) => canonicalJson(missingKey[key]) !== canonicalJson(baseline[key]))
    .map((key) => {
      const kind = kindOf(key, baseline[key], missingKey[key]);
      return {
        key,
        newWorkspaceText: conventionValueText(baseline[key], kind),
        missingKeyText: conventionValueText(missingKey[key], kind),
      };
    });

  const totals = {
    carriedN: rows.length,
    differsN: differing.length,
    atDefaultN: rows.length - differing.length,
    switchesN: switches.length,
    switchesOnN: on.length,
    switchesOffN: off.length,
    switchesIndeterminateN: indeterminate.length,
    inMemoryN: receipt.storedN,
    presentN: present.length,
    absentN: rows.length - present.length,
    sameOnReloadN: rows.filter((row) => row.sameOnReload).length,
    filledFromEmptyN: rows.filter((row) => row.filledFromEmpty).length,
    repairedN: repaired.length,
    notCarriedN: receipt.notLoadedN,
    retiredN: receipt.retiredN,
    fallbackDisagreementsN: fallbackDisagreements.length,
  };

  const claims = {
    // The printed list is a partition of the carried conventions.
    partitionHolds: totals.differsN + totals.atDefaultN === totals.carriedN,
    switchesReconcile: totals.switchesOnN + totals.switchesOffN + totals.switchesIndeterminateN === totals.switchesN,
    // Every key in memory is accounted for: carried, retired or named.
    keysReconcile: receipt.reconciles
      && receipt.carriedN === totals.presentN
      && totals.presentN + totals.retiredN + totals.notCarriedN === totals.inMemoryN,
    // Every carried key is either absent from memory or lands in ONE of three
    // piles: unchanged by a reload, filled from an empty value, or changed.
    memoryReconciles: totals.sameOnReloadN + totals.filledFromEmptyN + totals.repairedN === totals.presentN
      && totals.presentN + totals.absentN === totals.carriedN,
    // Two different facts, reported separately and never merged.
    nothingDropped: totals.notCarriedN === 0,
    nothingRepaired: totals.repairedN === 0,
  };
  claims.reloadStable = claims.nothingDropped && claims.nothingRepaired;

  return {
    ok: true,
    engineVersion: CONVENTION_REGISTER_ENGINE_VERSION,
    totals,
    claims,
    rows,
    differing,
    switchesOff: off.map((row) => row.key),
    switchesIndeterminate: indeterminate.map((row) => row.key),
    notCarried: receipt.notLoaded.map(printableSettingsKey),
    retired: receipt.retired.slice(),
    repaired: repaired.map((row) => ({ key: row.key, inMemoryText: row.inMemoryText, reloadText: row.inForceText })),
    fallbackDisagreements,
    switchDefects: {
      declaredButUnread: CONVENTION_SWITCH_DEFECTS.declaredButUnread.slice(),
      readButNotCarried: CONVENTION_SWITCH_DEFECTS.readButNotCarried.slice(),
    },
    method: CONVENTION_REGISTER_METHOD,
  };
}

/** The register as plain text — what a leader pastes into a control attestation. */
export function conventionRegisterBriefText(register) {
  if (!register || !register.ok) return 'No conventions register is available.';
  const t = register.totals;
  const lines = [
    `Conventions in force — ${register.engineVersion}`,
    `${t.carriedN} conventions carried by this version; ${t.differsN} differ from a new workspace's default, ${t.atDefaultN} are at the default.`,
    `${t.switchesN} automation switches: ${t.switchesOnN} on, ${t.switchesOffN} off${t.switchesIndeterminateN ? `, ${t.switchesIndeterminateN} unreadable` : ''}.`,
    register.switchesOff.length ? `Switched off: ${register.switchesOff.join(', ')}.` : 'Switched off: none.',
    register.claims.nothingDropped
      ? 'Reload check (keys): every convention in memory is one a reload would carry.'
      : `Reload check (keys): ${t.notCarriedN} convention(s) in memory would NOT survive a reload — ${register.notCarried.join(', ')}.`,
    register.claims.nothingRepaired
      ? 'Reload check (values): every carried value in memory is the value a reload would restore.'
      : `Reload check (values): ${t.repairedN} value(s) would be CHANGED by a reload — ${register.repaired.map((row) => `${row.key} (${row.inMemoryText} → ${row.reloadText})`).join(', ')}.`,
  ];
  if (register.differing.length) {
    lines.push('', 'Differ from the default (convention: default → in force):');
    for (const row of register.differing) lines.push(`  ${row.key}: ${row.defaultText} → ${row.inForceText}`);
  }
  const d = register.switchDefects;
  const notes = [];
  if (d.declaredButUnread.length) notes.push(`Declared but read by no rule (switching changes nothing): ${d.declaredButUnread.join(', ')}.`);
  if (d.readButNotCarried.length) notes.push(`Read by a rule but not storable (that rule cannot be paused): ${d.readButNotCarried.join(', ')}.`);
  for (const row of register.fallbackDisagreements) {
    notes.push(`Two defaults for ${row.key}: a new workspace starts at ${row.newWorkspaceText}; a stored file missing the key loads ${row.missingKeyText}.`);
  }
  if (notes.length) lines.push('', 'Known limits of this register:', ...notes.map((note) => `  ${note}`));
  lines.push('', 'Text values and the inside of structured values are never printed here.');
  return lines.join('\n');
}
