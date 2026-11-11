/**
 * app/core/domain/transferPriceRules.js — `RULE-TPL-01` on the shared
 * post-commit spine (ADR-0177, Schema v142).
 *
 * THE DUTY. A register that prints "three pairs traded labour with no agreed
 * price" is a dashboard. The duty a controller performs at period close is to
 * put a DATED, OWNED question in front of the one manager who can answer it.
 *
 * Behaviour:
 *  - Fires on transfer-price acts (propose / confirm / retire) and on an
 *    explicit `transfer.price.scan`. A read never fires it.
 *  - Fast-exits in O(1) when no transfer-price act exists — a workspace that
 *    never recorded a price is never nagged to start, matrix or not — or when
 *    `settings.transferPriceAutoPropagate` is `false` (an explicit scan always
 *    runs).
 *  - Reads the statement with the WHOLE-WORKSPACE operator view for the LAST
 *    COMPLETED CALENDAR QUARTER, so an ask does not depend on which seat
 *    pressed the button and never chases a period that is still running.
 *  - `countersign` asks: for every proposal still holding ONE key, at most one
 *    dated delegation to the NAMED manager who holds the missing key.
 *  - `price` asks: for every pair of lines that consumed share-days in the
 *    closed quarter with NO agreed price and no proposal covering them, at most
 *    one dated delegation per (pair, quarter) to the BORROWING manager — the
 *    line that consumed is the line that opens the negotiation. A price between
 *    the pair that later dies (declined, withdrawn, voided) opens one more.
 *  - Closes its own open asks once they are PROVABLY no longer owed, and writes
 *    the actual reason on the task (the key was turned; the proposal was
 *    declined or withdrawn; every share-day of that pair's quarter is under a
 *    proposed or agreed price). An ask about a quarter that is no longer the
 *    last completed one is re-read against ITS OWN quarter: it stays open while
 *    that quarter is still unpriced, and is never closed merely because the
 *    calendar moved on. An ask this rule cannot re-read is left open.
 *  - Typed provenance only: `issues-obligation` from the counterpart manager to
 *    the task and `rolls-up-to` from the task to every roster ancestor of the
 *    asked manager across the matrix DAG. Bounded by `asksPerCommit`; the
 *    remainder is counted and issued by a scan.
 *  - Records an idempotent `observation` (never a task) when the key belongs to
 *    the workspace leader or to a manager who has left the roster: nobody is
 *    substituted, and nobody is asked on somebody else's behalf.
 *  - Never signs a key, never posts a charge, never edits a budget, a line or
 *    an agreement, and never blocks a human decision.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import { buildTransferPriceLedger, compileTransferPrices } from './transferPrice.js';
import { normalizeTransferPriceSettings } from './transferPriceSchema.js';
import {
  TRANSFER_PRICE_EVENTS,
  TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_RULE_ID,
  transferPriceBasis,
} from './transferPriceRegistry.js';

export const TRANSFER_PRICE_TRIGGER_EVENTS = new Set([
  TRANSFER_PRICE_EVENTS.PROPOSED,
  TRANSFER_PRICE_EVENTS.CONFIRMED,
  TRANSFER_PRICE_EVENTS.RETIRED,
  TRANSFER_PRICE_EVENTS.SCAN,
]);

const clampStr = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** `price|<lender>><borrower>|<from>..<to>|g<generation>` — read from the END, so no id can confuse it. */
const PRICE_SUBJECT = /^(price\|.+)\|(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\|g\d+$/;
function parsePriceSubject(subjectKey) {
  const m = PRICE_SUBJECT.exec(String(subjectKey || ''));
  return m ? { pairPrefix: m[1], from: m[2], to: m[3] } : null;
}
const pairPrefixOf = (pair) => `price|${pair.lenderId}>${pair.borrowerId}`;
/** Older quarters re-read in one commit to judge an open ask. Beyond this the ask is left open, unjudged. */
const STALE_WINDOWS_PER_COMMIT = 4;

function recordMarker(draft, ctx, marker) {
  draft.transferPriceMarkers = Array.isArray(draft.transferPriceMarkers) ? draft.transferPriceMarkers : [];
  if (draft.transferPriceMarkers.some((m) => m && m.key === marker.key)) return false;
  draft.transferPriceMarkers.push({
    key: String(marker.key).slice(0, 320),
    kind: marker.kind,
    subjectKey: clampStr(marker.subjectKey, 280),
    taskId: marker.taskId ? clampStr(marker.taskId, 80) : null,
    state: clampStr(marker.state, 32),
    summary: clampStr(marker.summary, 280),
    at: ctx.nowIso,
  });
  const cap = TRANSFER_PRICE_LIMITS.markers;
  if (draft.transferPriceMarkers.length > cap) {
    draft.transferPriceMarkers.splice(0, draft.transferPriceMarkers.length - cap);
  }
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  const clean = clampStr(summary, 280);
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ ruleId: TRANSFER_PRICE_RULE_ID, rule: TRANSFER_PRICE_RULE_ID, action, entity, entityId, summary: clean });
  }
  out.push({ ruleId: TRANSFER_PRICE_RULE_ID, action, targetType: entity, targetId: entityId, summary: clean });
}

export function transferPriceRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!TRANSFER_PRICE_TRIGGER_EVENTS.has(eventType)) return [];
  if (!draft || !Array.isArray(draft.transferPriceActs) || draft.transferPriceActs.length === 0) return [];

  const conv = normalizeTransferPriceSettings(draft.settings || {});
  const explicit = eventType === TRANSFER_PRICE_EVENTS.SCAN;
  if (!explicit && conv.transferPriceAutoPropagate === false) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now: at,
    today,
    nowIso: ctx.nowIso || at.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const linkCtx = { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso };

  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const agreements = compileTransferPrices(draft.transferPriceActs);
  // Default window: the last completed calendar quarter, read whole-workspace.
  const report = buildTransferPriceLedger(view, { now: at, settings: operator });
  const window = report.window;

  const onRoster = (id) => Boolean(id) && id !== LEADER_ID && matrix.roster.has(id);
  const nameOf = (id) => (id === LEADER_ID ? (matrix.nodes.get(LEADER_ID)?.name || 'the workspace leader') : (matrix.roster.get(id)?.name || id));

  // The asks this rule issued that are still open, read once.
  const openAsks = [];
  if (Array.isArray(draft.transferPriceMarkers) && Array.isArray(draft.delegations)) {
    const activeById = new Map();
    for (const d of draft.delegations) if (d && d.status === 'active') activeById.set(d.id, d);
    for (const marker of draft.transferPriceMarkers) {
      if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
      const task = activeById.get(marker.taskId);
      if (task) openAsks.push({ marker, task });
    }
  }
  /** (pair, quarter, asked manager) → the subject of the ask still open for it, whatever generation issued it. */
  const openPriceSubject = new Map();
  for (const { marker, task } of openAsks) {
    const parsed = parsePriceSubject(marker.subjectKey);
    if (parsed) openPriceSubject.set(`${parsed.pairPrefix}|${parsed.from}..${parsed.to}|${task.personId}`, marker.subjectKey);
  }

  /** subjectKey → what is owed RIGHT NOW. */
  const owed = new Map();
  const observations = [];

  // 1. A proposal holding one key owes the OTHER manager's answer.
  for (const a of agreements.values()) {
    if (a.state !== 'proposed') continue;
    const missingSide = a.proposedBySide === 'lender' ? 'borrower' : 'lender';
    const askedId = missingSide === 'lender' ? a.lenderId : a.borrowerId;
    const counterpartId = missingSide === 'lender' ? a.borrowerId : a.lenderId;
    const subjectKey = `key|${a.id}`;
    if (!onRoster(askedId)) {
      observations.push({
        subjectKey,
        state: askedId === LEADER_ID ? 'leader-key' : 'off-roster-key',
        summary: askedId === LEADER_ID
          ? `Proposal ${a.id} awaits the workspace leader’s ${missingSide} key, which is turned in the operator view; no task was addressed to anybody else.`
          : `Proposal ${a.id} awaits the ${missingSide} key of ${askedId}, who is no longer on the roster; abstained from asking anybody else.`,
      });
      continue;
    }
    const basis = transferPriceBasis(a.basis);
    owed.set(subjectKey, {
      kind: 'countersign', askedId, counterpartId, state: 'awaiting-second-key',
      title: `Answer the transfer price ${nameOf(counterpartId)} proposed (${a.rateCents} ${a.currency} per person-day)`,
      outcome: (dueOn) => `By ${dueOn}, confirm or decline the price ${nameOf(counterpartId)} proposed for people ${nameOf(a.lenderId)}’s home line lends to ${nameOf(a.borrowerId)}’s line: ${a.rateCents} ${a.currency} per full person-day (${a.rateCents} cents per share-day; basis: ${basis ? basis.label.toLowerCase() : a.basis}), from ${a.effectiveFrom} to ${a.effectiveTo}. You hold the ${missingSide} key. Until both keys are on the record these share-days are refused as unpriced — never charged at zero and never at an average.`,
      edgeSummary: 'A proposed transfer price awaits this manager’s counterpart key.',
    });
  }

  // 2. A pair that consumed share-days in the closed quarter with no agreed
  //    price and no proposal covering them owes a proposal from the borrower.
  if (window.valid) {
    for (const pair of report.pairs) {
      const unpriced = pair.refused['no-agreed-price'] || 0;
      if (!unpriced || !pair.lenderId || !pair.borrowerId) continue;
      // The generation counts the prices between this pair that DIED over this
      // quarter (declined, withdrawn or voided). A pair whose proposal died is
      // owed a fresh ask; a pair nobody answered is not asked twice.
      let generation = 0;
      for (const a of agreements.values()) {
        if (a.lenderId === pair.lenderId && a.borrowerId === pair.borrowerId
          && (a.state === 'declined' || a.state === 'withdrawn' || a.state === 'voided')
          && a.effectiveFrom <= window.to && a.effectiveTo >= window.from) generation += 1;
      }
      const scope = `${pairPrefixOf(pair)}|${window.from}..${window.to}`;
      // An ask still open for this pair and quarter keeps answering for it: one
      // manager, one open question. A new generation is used only once the
      // earlier ask is closed.
      const subjectKey = openPriceSubject.get(`${scope}|${pair.borrowerId}`) || `${scope}|g${generation}`;
      if (!onRoster(pair.borrowerId)) {
        observations.push({
          subjectKey,
          state: pair.borrowerId === LEADER_ID ? 'leader-borrower' : 'off-roster-borrower',
          summary: `${unpriced} share-day(s) borrowed by ${pair.borrowerId === LEADER_ID ? 'the workspace leader’s line' : pair.borrowerId} from ${pair.lenderId} between ${window.from} and ${window.to} carry no agreed price; the borrower holds no roster seat, so no task was addressed to anybody else.`,
        });
        continue;
      }
      owed.set(subjectKey, {
        kind: 'price', askedId: pair.borrowerId, counterpartId: pair.lenderId, state: 'no-agreed-price',
        title: `Agree a transfer price with ${nameOf(pair.lenderId)} for ${window.from} to ${window.to}`,
        outcome: (dueOn) => `By ${dueOn}, propose a price to ${nameOf(pair.lenderId)} for the ${unpriced} share-day(s) your line consumed from their home line between ${window.from} and ${window.to} (${pair.peopleN} person(s) on ${pair.linesN} declared line(s)), or agree an explicit zero with them. The period stays REFUSED as unpriced until two keys are on the record; nothing is charged at zero or at an average in the meantime.`,
        edgeSummary: 'This line lent capacity in a closed quarter with no agreed transfer price.',
      });
    }
  }

  const out = [];
  let closedN = 0;
  const openSubjects = new Set();

  // 3. Close asks this rule issued that are PROVABLY no longer owed, with the
  //    actual reason. Anything it cannot prove is left open.
  const staleReports = new Map();
  const readQuarter = (from, to) => {
    if (window.valid && from === window.from && to === window.to) return report;
    const key = `${from}..${to}`;
    if (staleReports.has(key)) return staleReports.get(key);
    if (staleReports.size >= STALE_WINDOWS_PER_COMMIT) return null;
    const read = buildTransferPriceLedger(view, { from, to, now: at, settings: operator });
    staleReports.set(key, read);
    return read;
  };
  /** Why an open ask is no longer owed; `null` while it still is, or when that cannot be judged. */
  const settledReason = (marker, task) => {
    const subject = String(marker.subjectKey || '');
    if (subject.startsWith('key|')) {
      const a = agreements.get(subject.slice(4));
      if (!a) return 'the proposal it asked about is no longer on the record';
      if (a.state === 'declined') return `the proposal was declined on ${a.retiredOn}`;
      if (a.state === 'withdrawn') return `the proposal was withdrawn by its proposer on ${a.retiredOn}`;
      if (a.state === 'proposed') return 'the missing key is no longer held by a manager on the roster, so it is recorded as an observation instead of a task';
      return `the second key was turned on ${a.confirmedOn}`;
    }
    const parsed = parsePriceSubject(subject);
    if (!parsed) return null;
    const read = readQuarter(parsed.from, parsed.to);
    if (!read || !read.window.valid) return null;
    const pair = read.pairs.find((p) => p.lenderId && p.borrowerId && pairPrefixOf(p) === parsed.pairPrefix);
    if (!pair) return `no share-day between these two lines is read for ${parsed.from} to ${parsed.to} any more`;
    if (pair.borrowerId !== task.personId || !onRoster(pair.borrowerId)) return 'the borrowing line is no longer held by the manager this ask was addressed to';
    if ((pair.refused['no-agreed-price'] || 0) > 0) return null;
    return `every share-day this line consumed from that home line between ${parsed.from} and ${parsed.to} is now under a proposed or agreed price, or is refused for another printed reason`;
  };
  for (const { marker, task } of openAsks) {
    const still = owed.get(marker.subjectKey);
    if (still && still.askedId === task.personId) {
      openSubjects.add(marker.subjectKey);
      continue;
    }
    const reason = still ? 'the answer it asks for is not this manager’s to give' : settledReason(marker, task);
    if (!reason) {
      // Still owed for an older quarter, or not judgeable: left exactly as it is.
      openSubjects.add(marker.subjectKey);
      continue;
    }
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `Closed by ${TRANSFER_PRICE_RULE_ID} on ${today}: ${reason}. No key was turned on anyone’s behalf and no charge was posted.`.slice(0, 2000);
    task.updatedAt = hookCtx.nowIso;
    closedN += 1;
  }

  // 4. Issue bounded asks.
  let issuedN = 0;
  let deferredN = 0;
  let linkN = 0;
  let observedN = 0;
  const dueOn = addDays(today, conv.transferPriceAskDueDays);
  for (const [subjectKey, ask] of owed) {
    if (openSubjects.has(subjectKey)) continue;
    const markerKey = `ask|${subjectKey}`;
    // One ask per proposal and per (pair, quarter), ever: a manager who closed
    // or returned it is not asked again about the same thing.
    if (draft.transferPriceMarkers?.some((m) => m && m.key === markerKey)) continue;
    if (issuedN >= TRANSFER_PRICE_LIMITS.asksPerCommit) { deferredN += 1; continue; }

    const taskId = hookCtx.idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: ask.askedId,
      title: ask.title.slice(0, 200),
      expectedOutcome: ask.outcome(dueOn).slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${TRANSFER_PRICE_RULE_ID}. This ask blocks nothing and posts no charge. ${ask.kind === 'countersign'
        ? 'It closes automatically once you confirm or decline the price, or its proposer withdraws it.'
        : 'It closes automatically once every one of those share-days is under a proposed or agreed price.'}`.slice(0, 2000),
      delegatedOn: today,
      dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: hookCtx.nowIso,
      updatedAt: hookCtx.nowIso,
    });

    const edges = [];
    if (onRoster(ask.counterpartId)) {
      edges.push({ sourceType: 'person', sourceId: ask.counterpartId, targetType: 'delegation', targetId: taskId, relation: 'issues-obligation', summary: ask.edgeSummary });
    }
    const node = matrix.nodes.get(ask.askedId);
    for (const ancestorId of [...((node && node.ancestors) || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      edges.push({ sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId, relation: 'rolls-up-to', summary: 'A transfer-price ask rolls up to this leadership span.' });
    }
    for (const edge of edges) {
      const made = ensureEntityLink(draft, { ...edge, ruleId: TRANSFER_PRICE_RULE_ID }, linkCtx);
      if (made.created) linkN += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey, kind: 'ask', subjectKey, taskId, state: ask.state,
      summary: `Issued transfer-price ${ask.kind} ask ${taskId} to ${ask.askedId}.`,
    });
    openSubjects.add(subjectKey);
    issuedN += 1;
  }

  // 5. A key nobody on the roster can be asked for: observed, never substituted.
  for (const obs of observations) {
    if (recordMarker(draft, hookCtx, { key: `obs|${obs.subjectKey}`, kind: 'observation', subjectKey: obs.subjectKey, taskId: null, state: obs.state, summary: obs.summary })) observedN += 1;
  }

  if (closedN > 0) noteEffect(hookCtx, out, 'completed', 'delegation', 'transfer-prices', `Closed ${closedN} transfer-price ask(s) that are no longer owed.`);
  if (issuedN > 0) noteEffect(hookCtx, out, 'delegated', 'delegation', 'transfer-prices', `Issued ${issuedN} transfer-price ask(s) to the named line managers, due by ${dueOn}.`);
  if (linkN > 0) noteEffect(hookCtx, out, 'linked', 'link', 'transfer-prices', `Recorded ${linkN} typed provenance edge(s) for transfer-price asks.`);
  if (observedN > 0) noteEffect(hookCtx, out, 'observed', 'transferPriceMarkers', 'transfer-prices', `Recorded ${observedN} observation(s) for keys nobody on the roster can be asked for.`);
  if (deferredN > 0) noteEffect(hookCtx, out, 'deferred', 'workspace', 'transfer-prices', `Deferred ${deferredN} transfer-price ask(s) beyond the per-commit cap (${TRANSFER_PRICE_LIMITS.asksPerCommit}); run Scan to issue the remainder.`);
  return out;
}

transferPriceRule.id = 'transferPriceRule';
transferPriceRule.triggers = TRANSFER_PRICE_TRIGGER_EVENTS;
