/**
 * app/core/domain/conventionRegisterSchema.js — the settings LOAD RECEIPT
 * (ADR-0180, Schema v143 unchanged).
 *
 * `normalizeSettings` rebuilds the settings object field by field. That is the
 * right design — a hand-edited file cannot smuggle an unbounded number into an
 * engine — and it has one failure mode that eight ADR comments in `schema.js`
 * describe and nothing enforced: a key that is stored but not named is DROPPED,
 * and the load says nothing.
 *
 * This module turns that silence into a receipt. Every stored key lands in
 * exactly one of three piles, and the piles reconcile to the stored count:
 *
 *   carried     the loader names it; it is in the loaded settings
 *   retired     a historical migration wrote it at a known default and no
 *               version ever carried or read it as declared (counted, quiet)
 *   notLoaded   everything else — NAMED in a load warning, never dropped quietly
 *
 *   carriedN + retiredN + notLoadedN === storedN        (asserted, printed)
 *
 * A receipt is a statement about KEYS. It deliberately does not claim that a
 * carried value was loaded unchanged — a value outside its declared bounds is
 * repaired by the loader, and `conventionRegister.js` reports that as its own,
 * separate claim.
 *
 * Imports the registry only, so `schema.js` can import this without a cycle.
 * Pure: no DOM, no storage, no clock.
 */

import { CONVENTION_REGISTER_LIMITS, RETIRED_SETTINGS_KEYS } from './conventionRegisterRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * Canonical JSON: object keys sorted at every depth, so two settings values
 * that differ only in key order compare equal. `undefined` has no JSON form and
 * is rendered as the bare word, which no stored value can equal.
 */
export function canonicalJson(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

/** A stored key is untrusted text. Printed sanitised, bounded, never raw. */
export function printableSettingsKey(key) {
  const text = String(key).replace(/[^A-Za-z0-9_.$-]/g, '?').slice(0, CONVENTION_REGISTER_LIMITS.keyChars);
  return text || '(empty key)';
}

/**
 * The receipt for one load.
 *
 * @param rawSettings     the settings exactly as stored (after migration)
 * @param loadedSettings  what `normalizeSettings` made of them
 */
export function settingsLoadReceipt(rawSettings, loadedSettings) {
  // `undefined` and `null` both mean nothing was stored — not a failure.
  const present = rawSettings !== undefined && rawSettings !== null;
  const loaded = isPlainObject(loadedSettings) ? loadedSettings : {};

  if (!isPlainObject(rawSettings)) {
    return {
      present,
      readable: false,
      storedN: 0,
      carriedN: 0,
      retiredN: 0,
      notLoadedN: 0,
      carried: [],
      retired: [],
      notLoaded: [],
      reconciles: true,
      // Nothing stored is not a failure. Something stored that is not an object
      // is: the whole block was replaced by defaults, and that must be said.
      warning: present
        ? 'Settings: the stored settings block was not a readable object, so every convention was loaded at its default. No stored convention is in effect.'
        : null,
    };
  }

  const carried = [];
  const retired = [];
  const notLoaded = [];
  // A key whose value is `undefined` has no stored form (JSON drops it).
  const storedKeys = Object.keys(rawSettings).filter((key) => rawSettings[key] !== undefined);
  for (const key of storedKeys) {
    if (own(loaded, key)) {
      carried.push(key);
    } else if (own(RETIRED_SETTINGS_KEYS, key)
      && canonicalJson(rawSettings[key]) === canonicalJson(RETIRED_SETTINGS_KEYS[key])) {
      retired.push(key);
    } else {
      notLoaded.push(key);
    }
  }
  carried.sort();
  retired.sort();
  notLoaded.sort();

  const n = notLoaded.length;
  let warning = null;
  if (n) {
    const cap = CONVENTION_REGISTER_LIMITS.warningNames;
    const names = notLoaded.slice(0, cap).map(printableSettingsKey).join(', ');
    const more = n > cap ? ` and ${n - cap} more` : '';
    warning = n === 1
      ? `Settings: 1 stored convention is not recognised by this version and was NOT loaded — ${names}. Its stored value is not in effect.`
      : `Settings: ${n} stored conventions are not recognised by this version and were NOT loaded — ${names}${more}. Their stored values are not in effect.`;
  }

  return {
    present,
    readable: true,
    storedN: storedKeys.length,
    carriedN: carried.length,
    retiredN: retired.length,
    notLoadedN: n,
    carried,
    retired,
    notLoaded,
    reconciles: carried.length + retired.length + n === storedKeys.length,
    warning,
  };
}
