/**
 * tests/app/event-archive.test.mjs — ADR-0205's bounded encrypted capsule.
 * The tests exercise the real store, Sealed Spine rule, guarded API, WebCrypto
 * envelope and operator-facing panel; verification must never adopt event rows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { createStore } from '../../app/core/store.js';
import { SEAL_EVENTS, SEAL_GENESIS, SEAL_LIMITS } from '../../app/core/domain/sealRegistry.js';
import { sealRule } from '../../app/core/domain/sealRules.js';
import { activeSealKey, clearSealKey, registerSealKey } from '../../app/core/domain/sealCrypto.js';
import { EVENT_ARCHIVE_EVENT_CAP, EVENT_ARCHIVE_LIMITS } from '../../app/core/domain/eventArchiveRegistry.js';
import {
  createEventArchive,
  eventArchiveStatus,
  verifyEventArchive,
} from '../../app/core/domain/eventArchive.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { renderSeal } from '../../app/views/seal.js';

const FROM_DAY = '2027-07-01';
const THROUGH_DAY = '2027-07-01';
const NOW = new Date('2027-07-05T12:00:00.000Z');
const RETAIN_UNTIL = '2028-07-04';
const PASS = 'Cedar!River7';
const PURPOSE = 'Quarterly C-suite close evidence';
const REQUEST = {
  fromDay: FROM_DAY,
  throughDay: THROUGH_DAY,
  purpose: PURPOSE,
  retainUntilDay: RETAIN_UNTIL,
};
const clone = (value) => JSON.parse(JSON.stringify(value));

function makeHarness({ activeSeatId = null, storageAvailable = true, sealSettings = null } = {}) {
  let at = new Date('2027-06-30T23:30:00.000Z');
  let sequence = 0;
  const ids = (prefix) => `${prefix}-archive-${++sequence}`;
  const records = new Map();
  const storage = storageAvailable ? {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  } : null;
  const now = () => new Date(at);
  const store = createStore({
    storage,
    now,
    idFactory: ids,
    crypto: webcrypto,
    postCommitRules: [sealRule],
  });
  store.load();
  if (activeSeatId || sealSettings) {
    store.update((draft) => {
      if (activeSeatId) draft.settings.activeSeatId = activeSeatId;
      if (sealSettings) Object.assign(draft.settings, sealSettings);
    });
  }
  const api = createApi(store, { now, idFactory: ids, cryptoRef: webcrypto });
  const setTime = (value) => { at = new Date(value); };
  const sealCommit = (type, summary = type) => store.update(() => {}, {
    type,
    entity: 'workspace',
    entityId: '',
    summary,
  });
  return { store, api, setTime, sealCommit, records };
}

function closedWindowHarness(options = {}) {
  const h = makeHarness(options);
  h.sealCommit('seal.anchor', 'Start anchor before the reporting window');
  h.setTime('2027-07-01T12:00:00.000Z');
  h.sealCommit('seal.window-record', 'Closed-period source record');
  h.setTime('2027-07-02T12:00:00.000Z');
  h.sealCommit('seal.window-close', 'Later closing seal');
  h.setTime(NOW);
  return h;
}

function bootDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/',
    pretendToBeVisual: true,
  });
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'FileReader', 'localStorage'];
  const prior = Object.fromEntries(globals.map((key) => [key, globalThis[key]]));
  for (const key of globals) globalThis[key] = key === 'window' ? dom.window
    : key === 'document' ? dom.window.document
      : key === 'localStorage' ? dom.window.localStorage
        : dom.window[key];
  return {
    dom,
    restore() {
      dom.window.close();
      for (const key of globals) {
        if (prior[key] === undefined) delete globalThis[key];
        else globalThis[key] = prior[key];
      }
    },
  };
}

test('archive capsule is encrypted, audited and verified without restoring events', async () => {
  clearSealKey();
  const { store, api, setTime, records } = closedWindowHarness();
  const beforeEvents = store.state.events.length;
  const created = await api.sealArchiveCreate({
    ...REQUEST,
    retainUntilDay: RETAIN_UNTIL,
    passphrase: PASS,
    confirmPassphrase: PASS,
  });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.summary.fromDay, FROM_DAY);
  assert.equal(created.summary.throughDay, THROUGH_DAY);
  assert.equal(created.summary.windowEventsN, 2, 'both source event and its seal are inside the day window');
  assert.equal(created.summary.boundaryEventsN, 2, 'the post-window closing transaction remains as proof context');
  assert.equal(created.audit.sealed, true);
  assert.equal(created.audit.saved, true);
  assert.equal(store.state.events.length, beforeEvents + 2, 'one archive audit event and its own seal were appended');
  assert.ok(store.state.events.some((event) => event.type === SEAL_EVENTS.ARCHIVE_CREATED && event.entityId === created.archiveId));
  const auditEvent = store.state.events.find((event) => event.type === SEAL_EVENTS.ARCHIVE_CREATED && event.entityId === created.archiveId);
  assert.doesNotMatch(auditEvent.summary, new RegExp(PURPOSE), 'free-text purpose stays inside the encrypted capsule');
  const envelope = JSON.parse(created.json);
  assert.equal(envelope.purpose, 'event-archive');
  assert.equal(envelope.format, 'leados.vault');
  assert.doesNotMatch(created.json, new RegExp(PURPOSE), 'the downloaded JSON is ciphertext, not the declared purpose or event payload');
  assert.ok(created.json.length <= EVENT_ARCHIVE_LIMITS.maxFileChars);
  const chain = (await import('../../app/core/domain/sealChain.js')).verifySealChain(store.state);
  assert.equal(chain.chainValid, true);
  const persistedState = JSON.parse([...records.values()].at(-1));
  assert.ok(persistedState.events.some((event) => event.type === SEAL_EVENTS.ARCHIVE_CREATED && event.entityId === created.archiveId), 'the audit event reached durable storage');
  const persistedChain = (await import('../../app/core/domain/sealChain.js')).verifySealChain(persistedState);
  assert.equal(persistedChain.chainValid, true, 'the persisted workspace contains a valid seal chain');
  const persistedAuditBlock = persistedChain.blockList.find((block) => block.rev === created.audit.revision);
  assert.equal(persistedAuditBlock?.contentComplete, true, 'the persisted archive audit block is complete');
  assert.equal(persistedAuditBlock?.contentOk, true, 'the persisted archive audit block verifies');
  const archiveStateBeforeVerify = JSON.stringify(store.state);
  const verified = await api.sealArchiveVerify({
    text: created.json,
    passphrase: PASS,
    coverageFromDay: FROM_DAY,
    coverageThroughDay: THROUGH_DAY,
  });
  assert.equal(verified.ok, true, verified.error);
  assert.deepEqual(verified.report.window, {
    fromDay: FROM_DAY,
    throughDay: THROUGH_DAY,
    fromAt: '2027-07-01T00:00:00.000Z',
    throughAt: '2027-07-01T23:59:59.999Z',
  });
  assert.equal(verified.report.purpose, PURPOSE);
  assert.equal(verified.report.blocksN, created.summary.blocksN);
  assert.equal(verified.report.eventsN, created.summary.eventsN);
  assert.equal(verified.report.windowEventsN, created.summary.windowEventsN);
  assert.equal(verified.report.boundaryEventsN, created.summary.boundaryEventsN);
  assert.equal(verified.report.anchorProof.sealsN, created.summary.anchorChainSealsN);
  assert.equal(verified.report.targetCoverage.verdict, 'covered');
  assert.equal(verified.report.dataReturned, false);
  assert.equal(verified.report.restoredToWorkspace, false);
  assert.equal(verified.readOnly, true);
  assert.equal(verified.restored, false);
  assert.equal(JSON.stringify(store.state), archiveStateBeforeVerify, 'verification changes no stored state or revision');

  // Seat-scoped use can inspect aggregate proof status, but cannot create a
  // workspace-wide capsule or read archived event rows.
  store.update((draft) => { draft.settings.activeSeatId = 'leader'; });
  const seatState = JSON.stringify(store.state);
  assert.equal(api.sealArchiveStatus().report.canCreate, false);
  const seatVerify = await api.sealArchiveVerify({ text: created.json, passphrase: PASS });
  assert.equal(seatVerify.ok, true, seatVerify.error);
  const refusedCreate = await api.sealArchiveCreate({ ...REQUEST, retainUntilDay: RETAIN_UNTIL, passphrase: PASS, confirmPassphrase: PASS });
  assert.equal(refusedCreate.ok, false);
  assert.equal(JSON.stringify(store.state), seatState, 'seat refusal makes no mutation');
  assert.ok(SAFE_READS.has('sealArchiveStatus'));
  assert.ok(SAFE_READS.has('sealArchiveVerify'));

  const beforeImport = JSON.stringify(store.state);
  const importResult = await store.importBackup(created.json, { passphrase: PASS });
  assert.equal(importResult.ok, false, 'an archive-purpose envelope is not a workspace backup');
  assert.equal(JSON.stringify(store.state), beforeImport, 'workspace backup import refuses the capsule without adoption');

  setTime('2028-07-05T00:00:00.000Z');
  const expired = await api.sealArchiveVerify({ text: created.json, passphrase: PASS });
  assert.equal(expired.ok, true);
  assert.equal(expired.report.verdict, 'expired');
  assert.equal(expired.report.targetCoverage.verdict, 'not-requested');
  clearSealKey();
});

test('archive-created audit sealing is independent of automatic-sealing settings', async () => {
  clearSealKey();
  const postures = [
    { sealEnabled: false, sealAutoPropagate: true },
    { sealEnabled: false, sealAutoPropagate: false },
    { sealEnabled: true, sealAutoPropagate: false },
    { sealEnabled: true, sealAutoPropagate: true },
  ];
  for (const sealSettings of postures) {
    const h = closedWindowHarness({ sealSettings });
    const beforeEvents = h.store.state.events.length;
    const created = await h.api.sealArchiveCreate({
      ...REQUEST,
      retainUntilDay: RETAIN_UNTIL,
      passphrase: PASS,
      confirmPassphrase: PASS,
    });
    assert.equal(created.ok, true, `${JSON.stringify(sealSettings)}: ${created.error}`);
    assert.equal(h.store.state.events.length, beforeEvents + 2, 'the archive act and its own seal are appended in one revision');
    assert.equal(h.store.state.settings.sealEnabled, sealSettings.sealEnabled);
    assert.equal(h.store.state.settings.sealAutoPropagate, sealSettings.sealAutoPropagate);
    assert.equal(created.audit.sealed, true);
    assert.equal(created.audit.saved, true);
    const chain = (await import('../../app/core/domain/sealChain.js')).verifySealChain(h.store.state);
    assert.equal(chain.chainValid, true, JSON.stringify(sealSettings));
    const auditBlock = chain.blockList.find((block) => block.rev === created.audit.revision);
    assert.equal(auditBlock?.contentComplete, true, JSON.stringify(sealSettings));
    assert.equal(auditBlock?.contentOk, true, JSON.stringify(sealSettings));
  }
  clearSealKey();
});

test('capsule builder reports incomplete pre-anchor payloads without overstating anchor content', () => {
  const buildWithEvictedEvent = (evictedBlockIndex) => {
    const h = makeHarness();
    h.sealCommit('seal.pre-anchor-one', 'Older transaction before anchor');
    h.sealCommit('seal.start-anchor', 'Start anchor before reporting window');
    h.setTime('2027-07-01T12:00:00.000Z');
    h.sealCommit('seal.window-record', 'Closed-period source record');
    h.setTime('2027-07-02T12:00:00.000Z');
    h.sealCommit('seal.window-close', 'Later closing seal');
    h.setTime(NOW);

    const droppedTypes = evictedBlockIndex === 0
      ? new Set(['seal.pre-anchor-one'])
      : new Set(['seal.pre-anchor-one', 'seal.start-anchor']);
    assert.ok(h.store.state.events.some((event) => event.type === (evictedBlockIndex === 0 ? 'seal.pre-anchor-one' : 'seal.start-anchor')));
    h.store.state.events = h.store.state.events.filter((event) => !droppedTypes.has(event.type)); // oldest-first payload eviction; seal commitments remain
    const built = createEventArchive(h.store.state, { ...REQUEST, retainUntilDay: RETAIN_UNTIL }, { now: NOW, key: null });
    assert.equal(built.ok, true, built.error);
    const verified = verifyEventArchive(built.archive, { now: NOW, key: null });
    assert.equal(verified.ok, true, verified.error);
    return { built, report: verified.report };
  };

  const priorEvicted = buildWithEvictedEvent(0);
  assert.equal(priorEvicted.built.summary.preAnchorPayloadIncompleteBlocksN, 1);
  assert.equal(priorEvicted.built.summary.anchorBlockContentComplete, true);
  assert.equal(priorEvicted.report.anchorProof.preAnchorPayloadIncompleteBlocksN, 1);
  assert.equal(priorEvicted.report.anchorProof.anchorBlockContentComplete, true);
  assert.match(priorEvicted.report.anchorProof.contentNote, /1 earlier transaction payload/);
  assert.match(priorEvicted.report.anchorProof.contentNote, /anchor transaction itself was complete/);

  const anchorEvicted = buildWithEvictedEvent(1);
  assert.equal(anchorEvicted.built.summary.preAnchorPayloadIncompleteBlocksN, 1);
  assert.equal(anchorEvicted.built.summary.anchorBlockContentComplete, false);
  assert.equal(anchorEvicted.report.anchorProof.preAnchorPayloadIncompleteBlocksN, 1);
  assert.equal(anchorEvicted.report.anchorProof.anchorBlockContentComplete, false);
  assert.match(anchorEvicted.report.anchorProof.contentNote, /anchor transaction payload was also incomplete/);
});

test('capsule builder requires a verified genesis-to-anchor chain and full closed blocks', () => {
  clearSealKey();
  const source = closedWindowHarness();
  const built = createEventArchive(source.store.state, { ...REQUEST, retainUntilDay: RETAIN_UNTIL }, { now: NOW, key: null });
  assert.equal(built.ok, true, built.error);
  assert.equal(built.archive.anchorProof.length, 1);
  assert.equal(built.archive.anchorProof[0].prev, SEAL_GENESIS);
  assert.equal(built.summary.anchorBlockContentComplete, true);
  const verified = verifyEventArchive(built.archive, { now: NOW, key: null });
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.report.anchorProof.verdict, 'verified from genesis through the included start anchor');

  const brokenAnchor = clone(built.archive);
  brokenAnchor.anchorProof[0].prev = '1'.repeat(64);
  const anchorFailure = verifyEventArchive(brokenAnchor, { now: NOW, key: null });
  assert.equal(anchorFailure.ok, false);
  assert.equal(anchorFailure.reason, 'anchor-chain-gap');

  const changedBlock = clone(built.archive);
  changedBlock.blocks[0].events[0].summary = 'changed after sealing';
  const contentFailure = verifyEventArchive(changedBlock, { now: NOW, key: null });
  assert.equal(contentFailure.ok, false);
  assert.equal(contentFailure.reason, 'content-mismatch');

  const missingClose = makeHarness();
  missingClose.sealCommit('seal.anchor', 'Start anchor');
  missingClose.setTime('2027-07-01T12:00:00.000Z');
  missingClose.sealCommit('seal.window-record', 'Window record');
  missingClose.setTime(NOW);
  const closeFailure = createEventArchive(missingClose.store.state, { ...REQUEST, retainUntilDay: RETAIN_UNTIL }, { now: NOW, key: null });
  assert.equal(closeFailure.ok, false);
  assert.equal(closeFailure.reason, 'closing-seal-missing');

  const missingPurpose = createEventArchive(source.store.state, { ...REQUEST, purpose: '  ', retainUntilDay: RETAIN_UNTIL }, { now: NOW, key: null });
  assert.equal(missingPurpose.ok, false);
  assert.equal(missingPurpose.reason, 'purpose-required');
  const missingRetention = createEventArchive(source.store.state, { ...REQUEST, retainUntilDay: '' }, { now: NOW, key: null });
  assert.equal(missingRetention.ok, false);
  assert.equal(missingRetention.reason, 'bad-retention');
});

test('HMAC-sealed anchor chain cannot be verified without the source workspace key', () => {
  const keyText = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  clearSealKey();
  registerSealKey(keyText);
  const source = closedWindowHarness();
  const built = createEventArchive(source.store.state, { ...REQUEST, retainUntilDay: RETAIN_UNTIL }, { now: NOW, key: activeSealKey() });
  assert.equal(built.ok, true, built.error);
  const withoutKey = verifyEventArchive(built.archive, { now: NOW, key: null });
  assert.equal(withoutKey.ok, false);
  assert.equal(withoutKey.reason, 'key-required');
  const withKey = verifyEventArchive(built.archive, { now: NOW, key: activeSealKey() });
  assert.equal(withKey.ok, true, withKey.error);
  assert.match(withKey.report.segmentProof, /HMAC/);
  clearSealKey();
});

test('600-event pressure report matches stored ordinary count and archive view reveals no rows', async () => {
  clearSealKey();
  const h = makeHarness();
  h.store.update((draft, { logEvent }) => {
    for (let index = 0; index < EVENT_ARCHIVE_EVENT_CAP + 1; index += 1) {
      logEvent({ type: 'archive.test.event', entity: 'workspace', entityId: `private-${index}`, summary: `PRIVATE ARCHIVE ROW ${index}` });
    }
  }, { type: 'archive.test.batch', entity: 'workspace', entityId: '', summary: 'private test batch' });
  const status = eventArchiveStatus(h.store.state, { now: NOW, canCreate: true });
  const sealEventsN = h.store.state.events.filter((event) => event.type === SEAL_EVENTS.SEAL).length;
  const ordinaryStoredN = h.store.state.events.length - sealEventsN;
  assert.equal(ordinaryStoredN, EVENT_ARCHIVE_EVENT_CAP);
  assert.equal(status.ordinaryEventsN, ordinaryStoredN);
  assert.equal(status.pressure, 'at-cap');
  assert.equal(status.eventCap, EVENT_ARCHIVE_EVENT_CAP);
  assert.equal(EVENT_ARCHIVE_EVENT_CAP, 600);

  const dom = bootDom();
  try {
    const before = JSON.stringify(h.store.state);
    const ctx = {
      api: h.api,
      state: h.store.state,
      now: NOW,
      query: new URLSearchParams('panel=archive'),
      navigate() {},
      refresh() {},
    };
    const node = renderSeal(ctx);
    dom.dom.window.document.getElementById('view').replaceChildren(node);
    const displayed = node.textContent;
    assert.ok(displayed.includes(`${status.ordinaryEventsN} / ${status.eventCap}`), 'the UI prints the exact stored ordinary-event count and shared cap');
    assert.ok(displayed.includes(`${status.sealsN}`), 'the UI prints the exact retained seal count');
    assert.doesNotMatch(displayed, /PRIVATE ARCHIVE ROW|private-\d+/, 'status rendering never displays event summaries or ids');
    assert.equal(JSON.stringify(h.store.state), before, 'status rendering is a pure read');
    assert.equal(node.querySelector('[data-testid="event-archive-create"]').disabled, false);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((violation) => violation.id), [], 'archive panel accessibility');
  } finally {
    dom.restore();
  }
});

test('encrypted archive file is withheld when the audit event cannot be durably persisted', async () => {
  clearSealKey();
  const h = closedWindowHarness();
  const persistedBefore = [...h.records.values()].at(-1);
  h.records.set = () => { throw new Error('simulated storage quota'); };
  const result = await h.api.sealArchiveCreate({
    ...REQUEST,
    retainUntilDay: RETAIN_UNTIL,
    passphrase: PASS,
    confirmPassphrase: PASS,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'audit-save-failed');
  assert.equal(result.json, undefined, 'no encrypted file is released after a failed durable write');
  assert.match(result.error, /No file was delivered/);
  assert.ok(h.store.state.events.some((event) => event.type === SEAL_EVENTS.ARCHIVE_CREATED), 'the in-memory attempt is not mistaken for durable delivery');
  assert.equal([...h.records.values()].at(-1), persistedBefore, 'the prior durable workspace remains the only stored snapshot');
  clearSealKey();
});

test('operator gate and file-size limits fail closed before recording an archive', async () => {
  clearSealKey();
  const seat = makeHarness({ activeSeatId: 'leader' });
  const before = JSON.stringify(seat.store.state);
  const refusal = await seat.api.sealArchiveCreate({ ...REQUEST, retainUntilDay: RETAIN_UNTIL, passphrase: PASS, confirmPassphrase: PASS });
  assert.equal(refusal.ok, false);
  assert.equal(JSON.stringify(seat.store.state), before);

  const source = closedWindowHarness();
  const oversizeFile = ' '.repeat(EVENT_ARCHIVE_LIMITS.maxFileChars + 1);
  const verify = await source.api.sealArchiveVerify({ text: oversizeFile, passphrase: PASS });
  assert.equal(verify.ok, false);
  assert.equal(verify.reason, 'file-size');
  assert.equal(source.store.state.events.length, 6, 'a refused file does not change the live log');
  assert.equal(SEAL_LIMITS.sealEventCap, 5000);
  clearSealKey();
});
