/**
 * app/core/domain/conventionRegisterRegistry.js — the closed vocabulary of the
 * Conventions-in-Force Register (ADR-0180, Schema v143 unchanged).
 *
 * WHY THIS EXISTS. LeadOS runs on declared conventions — floors, windows,
 * tolerances and one off-switch per automatic rule family. They live in one
 * `settings` object that the load path rebuilds FIELD BY FIELD. A convention an
 * engine declares but the loader does not name is discarded on every reload,
 * with no warning: the leader paused an automation, the page said "off", and
 * the next session ran it again. Six engines had that hole (30 keys).
 *
 * Configuration control is an old discipline with a simple rule: the
 * configuration in force is a recorded, inspectable baseline, and a bypassed
 * automatic control is never invisible (configuration baselining in IT general
 * controls; bypass / override management in functional-safety practice). This
 * register is that baseline for the workspace's own conventions.
 *
 * Everything here is a constant. Nothing is fitted, learned or inferred.
 *
 * Leaf module: NO imports, so `app/core/schema.js` can depend on it without a
 * cycle.
 */

export const CONVENTION_REGISTER_ENGINE_VERSION = 'convention-register-2026.11-v1';

/**
 * An automation switch is a boolean convention whose key ends in `Auto<Word>`
 * (`…AutoPropagate`, `…AutoProtect`, `…AutoDraft`, `…AutoReconcile`,
 * `…AutoLearn`). The census is derived from the settings object itself, so a
 * new engine's switch appears in it the moment the loader carries it — the list
 * cannot go stale the way a hand-written one does.
 */
export const CONVENTION_SWITCH_PATTERN = /Auto[A-Z][a-z]+$/;

export function isConventionSwitchKey(key) {
  return typeof key === 'string' && CONVENTION_SWITCH_PATTERN.test(key);
}

/**
 * Keys a HISTORICAL MIGRATION writes that no version has ever carried, read
 * back as a declared convention, or let anyone set. The v93 → v94 step writes
 * them at the value below; the settings loader has always discarded them.
 *
 * A retired key stored at exactly its migration default is dropped quietly and
 * COUNTED (`retiredN`): stored and effective are the same value, so nothing a
 * human declared is lost. A retired key stored at ANY OTHER value was put there
 * by hand, is not in effect, and is named like every other unrecognised key.
 *
 * `omLabourRatePerHour` / `omCurrency`: `operatingModel.js` reads them raw with
 * a `|| 60` / `|| 'USD'` fallback, so the effective rate has always been the
 * default. That is a separate defect (a convention with no way to declare it),
 * recorded in ROADMAP.md — it is not repaired by pretending the key is carried.
 */
export const RETIRED_SETTINGS_KEYS = Object.freeze({
  omLabourRatePerHour: 60,
  omCurrency: 'USD',
  escalationSaturationPct: 85,
});

/**
 * Switch defects found by reading the source, PINNED TO THE SOURCE BY TEST
 * (`tests/app/convention-persistence.test.mjs` re-derives both lists from
 * `app/**` and fails when either drifts). A census that lists a switch which
 * gates nothing, or omits a rule that cannot be paused, would be reassurance
 * the record does not support — so both are printed beside it.
 *
 *  - `declaredButUnread`: carried and defaulted, read by no module. Switching
 *    it changes nothing.
 *  - `readButNotCarried`: a rule reads the switch to decide whether to run, and
 *    this version neither declares nor carries it — so the rule can never be
 *    paused, whatever its own comment says.
 */
export const CONVENTION_SWITCH_DEFECTS = Object.freeze({
  declaredButUnread: Object.freeze(['portfolioAutoPropagate']),
  readButNotCarried: Object.freeze(['fidelityAutoPropagate', 'priorityAutoPropagate']),
});

export const CONVENTION_REGISTER_LIMITS = Object.freeze({
  /** Names printed in one load warning before "and N more". */
  warningNames: 12,
  /** A stored key is untrusted text: printed sanitised and at most this long. */
  keyChars: 60,
  /** Rows the Settings card prints before stating how many it did not print. */
  tableRows: 200,
});

/** The closed set of value kinds a convention can have. */
export const CONVENTION_VALUE_KINDS = Object.freeze({
  switch: 'automation switch',
  flag: 'yes / no',
  number: 'number',
  text: 'text',
  structured: 'structured',
  unset: 'not set',
});

export const CONVENTION_REGISTER_METHOD = Object.freeze([
  Object.freeze({
    key: 'baseline',
    label: 'What "default" means',
    value: 'the value a brand-new workspace runs under once loaded — computed by passing a new workspace\'s settings through the loader, not copied from a second table',
  }),
  Object.freeze({
    key: 'in-force',
    label: 'What "in force" means',
    value: 'what the loader makes of the settings in memory: the value every engine reads after the next reload, and — unless the reload check below says otherwise — the value it reads now',
  }),
  Object.freeze({
    key: 'differs',
    label: 'What "differs" means',
    value: 'the value in force is not the default, compared as canonical JSON (key order ignored); nothing is rounded before comparing',
  }),
  Object.freeze({
    key: 'switch',
    label: 'What a switch is',
    value: 'a yes/no convention whose key ends in Auto<Word>; "off" means the value in force is false',
  }),
  Object.freeze({
    key: 'switch-meaning',
    label: 'What "off" promises',
    value: 'by this codebase\'s convention an …AutoPropagate switch set to false stops that engine\'s automatic rules on ordinary writes while its explicit scan still runs; the census reads the switch, never the rule, and names the switches it knows that convention does not hold for',
  }),
  Object.freeze({
    key: 'reload',
    label: 'The reload check',
    value: 'the settings in memory are passed through the same loader a reload uses; a key it would not carry and a value it would change are counted apart and named — two different failures, never one reassuring word',
  }),
  Object.freeze({
    key: 'empty',
    label: 'What is not counted as a change',
    value: 'a convention not yet written in memory, and an empty structured value ({} or []), declare nothing: the loader reads both at the default. Both are counted and printed; neither is a changed declaration',
  }),
  Object.freeze({
    key: 'not-printed',
    label: 'What is never printed',
    value: 'a text value (it may be a name or an id) and the inside of a structured value: the register prints the kind, whether it is set and whether it differs. Numbers and yes/no values are printed exactly as stored',
  }),
  Object.freeze({
    key: 'not-claimed',
    label: 'What this does not claim',
    value: 'not who changed a value or when (the action history holds the dated acts), not which rules a switch gates, and not that a default is a good choice',
  }),
]);
