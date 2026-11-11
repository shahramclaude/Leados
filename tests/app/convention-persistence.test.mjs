/**
 * ADR-0180 — Declared conventions survive a reload, and the Conventions-in-Force
 * Register (Schema v143 unchanged).
 *
 * WHAT THIS SUITE COVERS
 * ----------------------
 *   schema.js                     `normalizeSettings` carries every key any
 *                                 engine's settings normalizer declares, and
 *                                 `normalizeState` names a stored key it does
 *                                 not carry;
 *   conventionRegisterSchema.js   the settings load receipt;
 *   conventionRegister.js         the pure read model and its text brief;
 *   conventionRegisterCard.js     the card on the real Settings page.
 *
 * The contract proved here:
 *   - the DEFECT: six engines declared 30 conventions the loader discarded on
 *     every load. Each now loads as exactly the value its OWN normalizer keeps,
 *     for legal and hostile input alike;
 *   - the guard the defect lacked: any exported `normalize*Settings` whose keys
 *     the loader does not carry fails this suite;
 *   - under the REAL store and action layer, the three reachable setters write
 *     bytes that a fresh store over the same storage reads back unchanged, and
 *     a paused matrix fan-out STAYS paused across the reload (while the same
 *     write in an un-paused workspace reaches both of a shared person's
 *     managers);
 *   - a stored key the loader does not carry is NAMED in a load warning; a
 *     retired migration key at its default is counted, not announced;
 *   - display == stored: every figure the Settings card prints is the
 *     register's field, and every printed number is the stored byte text;
 *   - the reload check can FAIL (an injected lossy loader makes it fail), and
 *     its two failures are never merged.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState, normalizeState, normalizeSettings, migrate, DEFAULT_SETTINGS, SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { normalizeMatrixSettings } from '../../app/core/domain/matrixSchema.js';
import { normalizeDelegationLineSettings } from '../../app/core/domain/delegationLineSchema.js';
import { normalizeStructureHistorySettings } from '../../app/core/domain/structureHistorySchema.js';
import { normalizeDifferencesSettings } from '../../app/core/domain/differencingSchema.js';
import { normalizeFitSettings } from '../../app/core/domain/decisionFitSchema.js';
import { lcalConventionsFromSettings, normalizeLeaderCalibrationSettings } from '../../app/core/domain/leaderCalibration.js';
import {
  CONVENTION_REGISTER_LIMITS, CONVENTION_SWITCH_DEFECTS, RETIRED_SETTINGS_KEYS, isConventionSwitchKey,
} from '../../app/core/domain/conventionRegisterRegistry.js';
import { canonicalJson, settingsLoadReceipt } from '../../app/core/domain/conventionRegisterSchema.js';
import { buildConventionRegister, conventionRegisterBriefText } from '../../app/core/domain/conventionRegister.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-11-11T12:00:00.000Z');
const ISO = NOW.toISOString();

const OWNERS = [
  ['matrix', normalizeMatrixSettings],
  ['delegation lines', normalizeDelegationLineSettings],
  ['structure history', normalizeStructureHistorySettings],
  ['differencing', normalizeDifferencesSettings],
  ['decision fit', normalizeFitSettings],
  ['leader calibration', normalizeLeaderCalibrationSettings],
];

const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));

function person(id, name, level, managerId = null) {
  return { id, name, level, managerId, status: 'active', createdAt: ISO };
}

function line(id, personId, managerId, kind, shareH) {
  return {
    id, personId, managerId, kind, shareH, rights: [], fromISO: '2026-01-01', toISO: null,
    declaredAt: ISO, declaredBySeatId: null, history: [], status: 'active',
  };
}

/**
 * Vera (VP) over Finn (functional director) and Petra (project director).
 * Sam is the matrix case: a home line to Finn (0.60) and a project line to
 * Petra (0.40) — two managers, one person.
 */
function workspace(settings = {}) {
  const state = createEmptyState(ISO);
  state.people = [
    person('vp', 'Vera Vice', 'vp'),
    person('fd', 'Finn Functional', 'director', 'vp'),
    person('pd', 'Petra Project', 'director', 'vp'),
    person('sam', 'Sam Shared', 'ic', 'fd'),
  ];
  state.reportingLines = [
    line('h-sam', 'sam', 'fd', 'functional', 60),
    line('p-sam', 'sam', 'pd', 'project', 40),
  ];
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state, { now: NOW }).state;
}

function memoryStorage(map = new Map()) {
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function bootStore(storage, tag = 'a') {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${tag}-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const settingsWarnings = (warnings) => (warnings || []).filter((w) => String(w).startsWith('Settings:'));

/* ------------------------------------------- 1. the guard the defect lacked */

test('the loader carries every key that any exported normalize*Settings declares', async () => {
  const carried = new Set(Object.keys(normalizeSettings({})));
  const dir = path.join(ROOT, 'app/core/domain');
  const holes = [];
  let found = 0;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort()) {
    if (!/export function normalize[A-Za-z0-9]*Settings\b/.test(fs.readFileSync(path.join(dir, file), 'utf8'))) continue;
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const [name, fn] of Object.entries(mod)) {
      if (!/^normalize[A-Za-z0-9]*Settings$/.test(name) || typeof fn !== 'function') continue;
      found += 1;
      const out = fn({});
      assert.ok(out && typeof out === 'object' && !Array.isArray(out), `${file}:${name}({}) returns a settings object`);
      const missing = Object.keys(out).filter((key) => !carried.has(key));
      if (missing.length) holes.push(`${file}:${name} → ${missing.join(', ')}`);
    }
  }
  assert.ok(found >= 60, `the sweep is not vacuous (${found} settings normalizers found)`);
  assert.deepEqual(holes, [],
    'a convention an engine declares but `normalizeSettings` does not name is DROPPED on every load — spread the normalizer into normalizeSettings');
});

test('“default” is a new workspace: every DEFAULT_SETTINGS key is carried, and the loader is idempotent', () => {
  assert.deepEqual(createEmptyState(ISO).settings, { ...DEFAULT_SETTINGS }, 'a new workspace starts at DEFAULT_SETTINGS');
  const once = normalizeSettings(DEFAULT_SETTINGS);
  const notCarried = Object.keys(DEFAULT_SETTINGS).filter((key) => !Object.hasOwn(once, key));
  assert.deepEqual(notCarried, [], 'no declared default is discarded by the loader');
  assert.deepEqual(normalizeSettings(once), once, 'loading what was loaded changes nothing');
});

/* ----------------------------------------------- 2. the six engines, exactly */

test('the 30 conventions the loader used to drop now load as exactly their owner’s value', () => {
  const allKeys = OWNERS.flatMap(([, normalizer]) => Object.keys(normalizer({})));
  assert.equal(allKeys.length, 30, 'six engines, thirty conventions');
  assert.equal(new Set(allKeys).size, 30, 'no key is owned twice');

  // Legal, non-default declarations — one per key.
  const declared = {
    matrixBalanceHundredths: 9, matrixExpiringDays: 30, matrixAutoPropagate: false,
    delegationLineBudget: 7, delegationLineAskDueDays: 9, delegationLineAutoPropagate: false,
    structureHistoryReviewDays: 45,
    differencesCellFloor: 7, differencesWindowReleases: 9, differencesMinPoints: 9,
    differencesAutoProtect: false, differencesAutoPropagate: false,
    fitClassFloorN: 9, fitShareFloorN: 9, fitPricedFloorN: 9, fitHorizonUtilisationPct: 61,
    fitBaseErrorPct: 7, fitErrorPerDeficitPointPct: 1.25, fitReworkCostPct: 31, fitMonitoringCostPctPerRung: 3,
    fitNoEvidenceDeficitPts: 3, fitMaterialityPct: 17, fitProposalAfterDays: 9, fitReviewDays: 44,
    fitAutoPropagate: false,
    lcalMinSamples: 7, lcalVerdictSamples: 12, lcalOverconfidencePp: 15, lcalBadReliability: 0.09, lcalWarnReliability: 0.05,
  };
  assert.deepEqual(Object.keys(declared).sort(), allKeys.slice().sort(), 'the fixture declares every one of the thirty');

  // Hostile input: wrong types, out of bounds, a string where a number belongs.
  const hostile = Object.fromEntries(allKeys.map((key, i) => [key, [1e12, -1e12, 'abc', null, [], {}, '', NaN][i % 8]]));

  for (const [label, raw] of [['declared', declared], ['hostile', hostile], ['empty', {}]]) {
    const loaded = normalizeState({ ...createEmptyState(ISO), settings: { ...DEFAULT_SETTINGS, ...raw } }, { now: NOW }).state.settings;
    for (const [owner, normalizer] of OWNERS) {
      const own = normalizer({ ...DEFAULT_SETTINGS, ...raw });
      assert.deepEqual(pick(loaded, Object.keys(own)), own, `${label}: the loaded ${owner} conventions ARE the owner normalizer’s`);
    }
  }

  // Every legal declaration is kept as declared — not merely "kept as something".
  const kept = normalizeState({ ...createEmptyState(ISO), settings: { ...DEFAULT_SETTINGS, ...declared } }, { now: NOW }).state.settings;
  const lost = Object.keys(declared).filter((key) => kept[key] !== declared[key]);
  assert.deepEqual(lost, [], 'a legal declared value survives the load unchanged');

  // The calibration engine reads the same five numbers the loader keeps.
  const engine = lcalConventionsFromSettings({ settings: kept });
  assert.deepEqual(
    [engine.minSamples, engine.verdictSamples, engine.overconfidencePp, engine.badReliability, engine.warnReliability],
    [kept.lcalMinSamples, kept.lcalVerdictSamples, kept.lcalOverconfidencePp, kept.lcalBadReliability, kept.lcalWarnReliability],
  );
});

/* --------------------------------------------------------- 3. the real spine */

test('under the REAL store the reachable setters survive a reload, and a paused matrix fan-out stays paused', () => {
  // Control: the same write in an un-paused workspace reaches BOTH managers.
  const control = bootStore(memoryStorage(new Map([[STORAGE_KEY, JSON.stringify(workspace())]])), 'ctl');
  assert.equal(control.api.addCase({ title: 'Shared person case', kind: 'risk', ownerId: 'sam', openedOn: '2026-11-11' }).ok, true);
  const fan = control.store.state.links.filter((l) => l.ruleId === 'RULE-MTX-01' && l.relation === 'rolls-up-to');
  assert.deepEqual(fan.map((l) => l.targetId).sort(), ['fd', 'pd'], 'RULE-MTX-01 rolls Sam’s case up to the home manager AND the project manager');

  // The declared acts, through the action layer.
  const storage = memoryStorage(new Map([[STORAGE_KEY, JSON.stringify(workspace())]]));
  const first = bootStore(storage, 'one');
  assert.deepEqual(settingsWarnings(first.store.warnings), []);
  const m = first.api.matrixSetConventions({ matrixBalanceHundredths: 9, matrixExpiringDays: 30, matrixAutoPropagate: false });
  assert.equal(m.ok, true, m.error);
  const d = first.api.differencesSetConventions({ cellFloor: 7, windowReleases: 9, minPoints: 9 });
  assert.equal(d.ok, true, d.error);
  const f = first.api.fitSetConventions({ fitReviewDays: 44, fitAutoPropagate: false, fitMaterialityPct: 17 });
  assert.equal(f.ok, true, f.error);

  const expected = {
    matrixBalanceHundredths: 9, matrixExpiringDays: 30, matrixAutoPropagate: false,
    differencesCellFloor: 7, differencesWindowReleases: 9, differencesMinPoints: 9,
    fitReviewDays: 44, fitAutoPropagate: false, fitMaterialityPct: 17,
  };
  const keys = Object.keys(expected);

  // The bytes on disk hold the declarations …
  const bytes = JSON.parse(storage.map.get(STORAGE_KEY)).settings;
  assert.deepEqual(pick(bytes, keys), expected, 'the persisted bytes carry every declared convention');

  // … and a fresh store over the same storage reads them back, with no warning.
  const second = bootStore(storage, 'two');
  assert.deepEqual(pick(second.store.state.settings, keys), expected, 'a reload keeps every declared convention');
  assert.deepEqual(settingsWarnings(second.store.warnings), [], 'nothing stored went unloaded');

  // The switch is not only stored — it GATES. The identical write after the
  // reload produces no matrix fan-out, because the pause survived.
  assert.equal(second.api.addCase({ title: 'Shared person case', kind: 'risk', ownerId: 'sam', openedOn: '2026-11-11' }).ok, true);
  assert.deepEqual((second.store.lastPropagations || []).filter((e) => e && e.ruleId === 'RULE-MTX-01'), [],
    'RULE-MTX-01 stays paused after the reload');
  assert.equal(second.store.state.links.filter((l) => l.ruleId === 'RULE-MTX-01').length, 0);

  // display == stored: the register read from the reloaded state is the bytes.
  const afterBytes = JSON.parse(storage.map.get(STORAGE_KEY)).settings;
  const register = buildConventionRegister(second.store.state);
  assert.deepEqual(register.switchesOff, ['fitAutoPropagate', 'matrixAutoPropagate']);
  assert.deepEqual(register.switchesOff,
    Object.keys(afterBytes).filter((key) => isConventionSwitchKey(key) && afterBytes[key] === false).sort(),
    'the printed off-list is exactly the switches stored as false');
  assert.deepEqual(register.differing.map((row) => row.key), keys.slice().sort(), 'the nine declared conventions are the nine that differ');
  for (const row of register.differing) {
    const stored = afterBytes[row.key];
    assert.equal(row.inForceText, typeof stored === 'boolean' ? (stored ? 'on' : 'off') : JSON.stringify(stored),
      `${row.key}: the printed value is the stored byte text`);
  }
  assert.equal(register.claims.reloadStable, true);
});

/* -------------------------------------------------------- 4. the load receipt */

test('a stored convention the loader does not carry is NAMED at load — never dropped in silence', () => {
  const base = workspace();
  const seed = (settings) => memoryStorage(new Map([[STORAGE_KEY, JSON.stringify({ ...base, settings })]]));

  // One unknown key, one retired key at its migration default, one retired key
  // at a value a human put there.
  const hit = bootStore(seed({ ...base.settings, zzFutureKey: 5, omCurrency: 'USD', escalationSaturationPct: 70 }), 'w1');
  assert.deepEqual(settingsWarnings(hit.store.warnings), [
    'Settings: 2 stored conventions are not recognised by this version and were NOT loaded — escalationSaturationPct, zzFutureKey. Their stored values are not in effect.',
  ]);
  assert.equal(Object.hasOwn(hit.store.state.settings, 'zzFutureKey'), false, 'the loader still refuses the key — it now says so');

  const one = bootStore(seed({ ...base.settings, zzFutureKey: 5 }), 'w2');
  assert.deepEqual(settingsWarnings(one.store.warnings), [
    'Settings: 1 stored convention is not recognised by this version and was NOT loaded — zzFutureKey. Its stored value is not in effect.',
  ]);

  // A clean workspace and an UPGRADED one (every migration applied) load quietly:
  // the three keys a historical migration writes are retired, not announced.
  assert.deepEqual(settingsWarnings(bootStore(seed(base.settings), 'w3').store.warnings), []);
  const upgraded = migrate({ schemaVersion: 1, settings: {}, people: [] }).raw;
  for (const [key, value] of Object.entries(RETIRED_SETTINGS_KEYS)) {
    assert.equal(canonicalJson(upgraded.settings[key]), canonicalJson(value), `the migration still writes ${key} at its retired default`);
  }
  const upgradedLoad = normalizeState(upgraded, { now: NOW });
  assert.equal(upgradedLoad.state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(settingsWarnings(upgradedLoad.warnings), [], 'an upgrade produces no settings warning');

  // The receipt reconciles to the stored count, pile by pile.
  const raw = { ...base.settings, zzFutureKey: 5, omCurrency: 'USD', escalationSaturationPct: 70 };
  const receipt = settingsLoadReceipt(raw, normalizeSettings(raw));
  assert.deepEqual([receipt.retired, receipt.notLoaded], [['omCurrency'], ['escalationSaturationPct', 'zzFutureKey']]);
  assert.equal(receipt.carriedN + receipt.retiredN + receipt.notLoadedN, receipt.storedN);
  assert.equal(receipt.storedN, Object.keys(raw).length);
  assert.equal(receipt.reconciles, true);

  // A stored key is untrusted text: sanitised, bounded, and the list is capped.
  const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`zz${String(i).padStart(2, '0')}`, i]));
  const hostileKey = `<img src=x onerror=alert(1)>${'k'.repeat(200)}`;
  const capped = settingsLoadReceipt({ ...many, [hostileKey]: 1 }, normalizeSettings({}));
  assert.equal(capped.notLoadedN, 16);
  assert.match(capped.warning, / and 4 more\. Their stored values are not in effect\.$/);
  assert.equal(/[<>=()]/.test(capped.warning.split(' — ')[1]), false, 'no markup survives into the warning');
  const lone = settingsLoadReceipt({ [hostileKey]: 1 }, normalizeSettings({}));
  assert.ok(lone.warning.split(' — ')[1].split('.')[0].length <= CONVENTION_REGISTER_LIMITS.keyChars, 'a printed key is bounded');

  // Nothing stored is not a failure; something stored that is not an object is.
  assert.equal(settingsLoadReceipt(undefined, normalizeSettings(undefined)).warning, null);
  assert.equal(settingsLoadReceipt(null, normalizeSettings(null)).warning, null);
  for (const broken of ['oops', 7, [1, 2], true]) {
    const result = normalizeState({ ...createEmptyState(ISO), settings: broken }, { now: NOW });
    assert.equal(settingsWarnings(result.warnings).length, 1, `settings: ${JSON.stringify(broken)} is announced`);
    assert.match(settingsWarnings(result.warnings)[0], /not a readable object/);
  }
});

/* ----------------------------------------------------------- 5. the register */

test('the register’s claims hold on a new workspace, and its reload check can FAIL', () => {
  // A brand-new workspace, before its first reload.
  const fresh = buildConventionRegister(createEmptyState(ISO));
  assert.equal(fresh.totals.differsN, 0, 'a new workspace differs from a new workspace in nothing');
  assert.equal(fresh.totals.switchesOffN, 0);
  assert.equal(fresh.totals.switchesOnN, fresh.totals.switchesN);
  assert.equal(fresh.totals.carriedN, Object.keys(normalizeSettings({})).length);
  assert.equal(fresh.totals.inMemoryN, Object.keys(DEFAULT_SETTINGS).length);
  for (const [name, holds] of Object.entries(fresh.claims)) assert.equal(holds, true, `claim ${name} holds on a new workspace`);

  // The same claims over a loaded matrix workspace with declared differences.
  const state = workspace({ matrixAutoPropagate: false, differencesCellFloor: 7 });
  const register = buildConventionRegister(state);
  const t = register.totals;
  assert.equal(t.differsN + t.atDefaultN, t.carriedN);
  assert.equal(t.switchesOnN + t.switchesOffN + t.switchesIndeterminateN, t.switchesN);
  assert.equal(t.sameOnReloadN + t.filledFromEmptyN + t.repairedN, t.presentN);
  assert.equal(t.presentN + t.absentN, t.carriedN);
  assert.equal(t.presentN + t.retiredN + t.notCarriedN, t.inMemoryN);
  assert.deepEqual(register.differing.map((row) => [row.key, row.defaultText, row.inForceText]), [
    ['differencesCellFloor', '3', '7'],
    ['matrixAutoPropagate', 'on', 'off'],
  ]);
  assert.equal(register.claims.reloadStable, true);
  // Every switch the register counts is a boolean the loader carries.
  const carried = normalizeSettings(state.settings);
  assert.equal(t.switchesN, Object.keys(carried).filter((key) => isConventionSwitchKey(key) && typeof carried[key] === 'boolean').length);

  // Two DIFFERENT failures, proved separately with an injected loader.
  const dropping = (raw) => { const out = normalizeSettings(raw); delete out.matrixAutoPropagate; return out; };
  const dropped = buildConventionRegister(state, { loader: dropping });
  assert.equal(dropped.claims.nothingDropped, false);
  assert.equal(dropped.claims.nothingRepaired, true, 'a dropped key is not reported as a changed value');
  assert.deepEqual(dropped.notCarried, ['matrixAutoPropagate']);
  assert.equal(dropped.claims.reloadStable, false);

  const changing = (raw) => ({ ...normalizeSettings(raw), differencesCellFloor: 3 });
  const changed = buildConventionRegister(state, { loader: changing });
  assert.equal(changed.claims.nothingRepaired, false);
  assert.equal(changed.claims.nothingDropped, true, 'a changed value is not reported as a dropped key');
  assert.deepEqual(changed.repaired, [{ key: 'differencesCellFloor', inMemoryText: '7', reloadText: '3' }]);
  assert.equal(changed.claims.reloadStable, false);

  // A value held in memory outside its bounds is reported, with both numbers.
  const drifted = buildConventionRegister({ settings: { ...state.settings, pulseMinResponses: 99, zzNotCarried: 1 } });
  assert.deepEqual(drifted.repaired, [{ key: 'pulseMinResponses', inMemoryText: '99', reloadText: '25' }]);
  assert.deepEqual(drifted.notCarried, ['zzNotCarried']);
  const brief = conventionRegisterBriefText(drifted);
  assert.ok(brief.includes('1 convention(s) in memory would NOT survive a reload — zzNotCarried.'));
  assert.ok(brief.includes('1 value(s) would be CHANGED by a reload — pulseMinResponses (99 → 25).'));

  // Reading stores nothing.
  const before = JSON.stringify(state);
  buildConventionRegister(state);
  conventionRegisterBriefText(buildConventionRegister(state));
  assert.equal(JSON.stringify(state), before);
});

test('a text value and the inside of a structured value are never printed', () => {
  const state = workspace({ leaderName: 'Ada Secretname', teamName: 'Team Hushhush', orgName: 'Org Quietly', activeSeatId: 'vp' });
  state.settings = { ...state.settings, successionDailyCosts: { 'seat-hidden': 98765 } };
  const register = buildConventionRegister(state);
  const everything = `${JSON.stringify(register)}\n${conventionRegisterBriefText(register)}`;
  for (const secret of ['Ada Secretname', 'Team Hushhush', 'Org Quietly', 'seat-hidden', '98765']) {
    assert.equal(everything.includes(secret), false, `${secret} is not printed`);
  }
  // …but that they differ IS printed.
  const differing = new Set(register.differing.map((row) => row.key));
  for (const key of ['leaderName', 'teamName', 'orgName', 'activeSeatId']) assert.ok(differing.has(key), `${key} is listed as differing`);
  assert.equal(register.rows.find((row) => row.key === 'leaderName').inForceText, 'text (not printed)');
});

/* ------------------------------------ 6. the defect lists stay true to source */

function appSources() {
  const skip = new Set(['app/core/schema.js', 'app/core/domain/conventionRegisterRegistry.js']);
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js') && !skip.has(path.relative(ROOT, full).split(path.sep).join('/'))) out.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'app'));
  return out;
}

test('the printed switch defects and default disagreements are re-derived from the source', () => {
  const sources = appSources();
  const carried = normalizeSettings({});
  const switches = Object.keys(carried).filter((key) => isConventionSwitchKey(key) && typeof carried[key] === 'boolean');

  // Declared, carried, and read by no module outside the schema.
  const unread = switches.filter((key) => !sources.some((text) => text.includes(key))).sort();
  assert.deepEqual(unread, [...CONVENTION_SWITCH_DEFECTS.declaredButUnread].sort(),
    'CONVENTION_SWITCH_DEFECTS.declaredButUnread must list exactly the switches no module reads');

  // Read by a rule, not carried by the loader (so it can never be stored).
  const referenced = new Set();
  const pattern = /\b([a-z][A-Za-z0-9]*Auto(?:Propagate|Protect|Draft|Reconcile|Learn))\b/g;
  for (const text of sources) for (const match of text.matchAll(pattern)) referenced.add(match[1]);
  const notCarried = [...referenced].filter((key) => !Object.hasOwn(carried, key) && !/^set[A-Z]/.test(key)).sort();
  assert.deepEqual(notCarried, [...CONVENTION_SWITCH_DEFECTS.readButNotCarried].sort(),
    'CONVENTION_SWITCH_DEFECTS.readButNotCarried must list exactly the switches a rule reads and the loader does not carry');

  // Two declared defaults for one convention. A RATCHET: this list may only
  // shrink. Fixing one means deleting it here; a third fails the build.
  const register = buildConventionRegister(createEmptyState(ISO));
  assert.deepEqual(register.fallbackDisagreements, [
    { key: 'epistemicBlindFloor', newWorkspaceText: '55', missingKeyText: '0.55' },
    { key: 'solvencyAlarmPct', newWorkspaceText: '30', missingKeyText: '50' },
  ]);
});

/* --------------------------------------- 7. the card on the real Settings page */

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function bootDocument(seed) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  window.localStorage.setItem(STORAGE_KEY, seed);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, errors };
}

test('the Settings page prints the register the record holds — figure for figure, and a render stores nothing', async () => {
  const state = workspace({
    matrixAutoPropagate: false, fitAutoPropagate: false, differencesCellFloor: 7, matrixExpiringDays: 30,
    lcalBadReliability: 0.09, leaderName: 'Ada Secretname',
  });
  // One key the loader does not carry, so the page must also show the load warning.
  const seed = JSON.stringify({ ...state, settings: { ...state.settings, zzFutureKey: 5 } });
  const env = bootDocument(seed);
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });

  const bytesBefore = env.window.localStorage.getItem(STORAGE_KEY);
  const stateBefore = JSON.stringify(app.store.state);
  app.navigate('#/settings');
  const view = env.document.getElementById('view');
  const cardNode = view.querySelector('[data-card="convention-register"]');
  assert.ok(cardNode, 'the card is on the real Settings page');
  assert.deepEqual(env.errors, [], 'the page rendered without an error');
  assert.equal(view.querySelector('.error-panel'), null);

  // A render stores nothing — not in memory, not on disk.
  assert.equal(JSON.stringify(app.store.state), stateBefore);
  assert.equal(env.window.localStorage.getItem(STORAGE_KEY), bytesBefore);

  const register = buildConventionRegister(app.store.state);
  const stored = JSON.parse(bytesBefore).settings;
  const field = (name) => cardNode.querySelector(`[data-crg="${name}"]`);

  // Every printed figure IS the register's field.
  for (const name of ['carriedN', 'differsN', 'atDefaultN', 'switchesN', 'switchesOnN', 'switchesOffN']) {
    assert.equal(field(name).textContent, String(register.totals[name]), `${name} on the page is the register’s`);
  }
  assert.equal(Number(field('differsN').textContent) + Number(field('atDefaultN').textContent), Number(field('carriedN').textContent),
    'the printed parts add to the printed total');
  assert.equal(Number(field('switchesOnN').textContent) + Number(field('switchesOffN').textContent), Number(field('switchesN').textContent));

  // The printed off-list is exactly the switches the stored bytes hold as false.
  const printedOff = [...field('switchesOff').querySelectorAll('li')].map((li) => li.textContent);
  assert.deepEqual(printedOff, register.switchesOff);
  assert.deepEqual(printedOff, Object.keys(stored).filter((key) => isConventionSwitchKey(key) && stored[key] === false).sort());
  assert.deepEqual(printedOff, ['fitAutoPropagate', 'matrixAutoPropagate']);

  // Row for row: the printed table is the register's differing list, and every
  // printed number is the stored byte text.
  const rows = [...cardNode.querySelectorAll('tr[data-crg-row]')];
  assert.deepEqual(rows.map((tr) => tr.getAttribute('data-crg-row')), register.differing.map((row) => row.key));
  assert.deepEqual(rows.map((tr) => tr.getAttribute('data-crg-row')),
    ['differencesCellFloor', 'fitAutoPropagate', 'lcalBadReliability', 'leaderName', 'matrixAutoPropagate', 'matrixExpiringDays']);
  for (const tr of rows) {
    const key = tr.getAttribute('data-crg-row');
    const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent);
    const row = register.differing.find((r) => r.key === key);
    assert.deepEqual(cells, [row.key, row.kindLabel, row.defaultText, row.inForceText]);
    if (typeof stored[key] === 'number') assert.equal(cells[3], JSON.stringify(stored[key]), `${key}: printed number == stored bytes`);
    if (typeof stored[key] === 'boolean') assert.equal(cells[3], stored[key] ? 'on' : 'off', `${key}: printed switch == stored bytes`);
  }
  assert.equal(cardNode.textContent.includes('Ada Secretname'), false, 'the card does not print a text value');

  // The reload check prints its two claims apart, in words.
  assert.equal(field('nothingDropped').getAttribute('data-state'), 'holds');
  assert.equal(field('nothingRepaired').getAttribute('data-state'), 'holds');
  assert.ok(field('nothingDropped').textContent.startsWith('Holds'));

  // The load warning the store raised is the warning the card shows.
  const raised = settingsWarnings(app.store.warnings);
  assert.deepEqual(raised, [
    'Settings: 1 stored convention is not recognised by this version and was NOT loaded — zzFutureKey. Its stored value is not in effect.',
  ]);
  assert.deepEqual([...field('loadWarnings').querySelectorAll('li')].map((li) => li.textContent), raised);

  // The known limits printed are the register's, all of them.
  const limits = [...field('limits').querySelectorAll('li')].map((li) => li.textContent);
  assert.equal(limits.length,
    register.switchDefects.declaredButUnread.length + register.switchDefects.readButNotCarried.length + register.fallbackDisagreements.length);
  assert.ok(limits.some((text) => text.startsWith('portfolioAutoPropagate is declared and stored but read by no rule')));

  // The text brief opens from the card and carries the same figures.
  cardNode.querySelector('.card-actions button').click();
  const textarea = env.document.querySelector('.modal textarea, dialog textarea, textarea');
  assert.ok(textarea, 'the brief opens in a dialog');
  assert.equal(textarea.value, conventionRegisterBriefText(register));
  assert.ok(textarea.value.includes(`${register.totals.carriedN} conventions carried by this version; 6 differ`));
});
