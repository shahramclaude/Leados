/**
 * app/core/domain/chargebackPostingRules.js — `RULE-CBP-01` on the shared
 * post-commit spine (ADR-0194, Schema v154).
 *
 * THE DUTY. The hardest period-close failure is not a wrong figure — it is a
 * quarter whose statement finally reads COMPLETE and then sits unposted until
 * a voided price or a retune quietly restates it, at which point the moment
 * nobody owned has produced figures nobody signed. This rule notices the
 * complete, unposted quarter currency and puts ONE dated ask in front of the
 * one seat the whole internal trade rolls up to.
 *
 * Behaviour:
 *  - Fires on transfer-price keys turning or dying (confirm / retire — the two
 *    acts that change completeness), on posting acts (post / reverse) and on
 *    an explicit `chargeback.posting.scan`. A read never fires it.
 *  - Fast-exits in O(1) when no transfer-price act exists: a workspace that
 *    never priced anything can never have a complete statement to post.
 *    Pausable with `chargebackPostingAutoPropagate`; an explicit scan always
 *    runs (the pause silences automation, not a human pressing the button).
 *  - Reads the statement whole-workspace for the LAST COMPLETED CALENDAR
 *    QUARTER. Only a currency whose claims ALL hold and that carries a charged
 *    cent owes a posting; an incomplete quarter owes RULE-TPL-01's asks, not
 *    this rule's.
 *  - Recipient: the LOWEST JOINT APEX, in the matrix DAG, of every line
 *    account the currency's statement names — the one seat accountable for
 *    both sides of every internal charge. An ambiguous apex, the workspace
 *    leader, or an apex off the roster records an identity-free OBSERVATION;
 *    nobody is substituted and nobody is asked on someone else's behalf.
 *  - One ask per (quarter, currency) per posting generation: a reversal opens
 *    a new generation, a calendar quarter rolling over does not close the old
 *    ask — it is re-read against ITS OWN quarter, bounded per commit.
 *  - Closes its own asks with the actual reason written on the task: the
 *    posting was made; the quarter's statement regressed (RULE-TPL-01 owns the
 *    missing prices); the currency no longer carries a charge; or the apex
 *    seat moved. An ask it cannot re-read is left open.
 *  - Never posts, never reverses, never binds an envelope, never signs a key
 *    and never blocks a human decision.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildTransferPriceLedger } from './transferPrice.js';
import { formatCents } from './transferPriceSchema.js';
import { compileChargebackPostings, periodCurrencyKey, statementAccountCents } from './chargebackPosting.js';
import { normalizeChargebackPostingSettings } from './chargebackPostingSchema.js';
import {
  CHARGEBACK_POSTING_EVENTS,
  CHARGEBACK_POSTING_LIMITS,
  CHARGEBACK_POSTING_RULE_ID,
} from './chargebackPostingRegistry.js';
import { TRANSFER_PRICE_EVENTS } from './transferPriceRegistry.js';

export const CHARGEBACK_POSTING_TRIGGER_EVENTS = new Set([
  TRANSFER_PRICE_EVENTS.CONFIRMED,
  TRANSFER_PRICE_EVENTS.RETIRED,
  CHARGEBACK_POSTING_EVENTS.POSTED,
  CHARGEBACK_POSTING_EVENTS.REVERSED,
  CHARGEBACK_POSTING_EVENTS.SCAN,
]);

const clampStr = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** `post|<from>..<to>|<currency>|g<generation>` — parsed from the end, so no id can confuse it. */
const POST_SUBJECT = /^post\|(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\|([A-Z]{3})\|g\d+$/;
function parsePostSubject(subjectKey) {
  const m = POST_SUBJECT.exec(String(subjectKey || ''));
  return m ? { from: m[1], to: m[2], currency: m[3] } : null;
}
/** Older quarters re-read in one commit to judge an open ask. Beyond this the ask is left open, unjudged. */
const STALE_WINDOWS_PER_COMMIT = 4;

function recordMarker(draft, ctx, marker) {
  draft.chargebackPostingMarkers = Array.isArray(draft.chargebackPostingMarkers) ? draft.chargebackPostingMarkers : [];
  if (draft.chargebackPostingMarkers.some((m) => m && m.key === marker.key)) return false;
  draft.chargebackPostingMarkers.push({
    key: String(marker.key).slice(0, 320),
    kind: marker.kind,
    subjectKey: clampStr(marker.subjectKey, 280),
    taskId: marker.taskId ? clampStr(marker.taskId, 80) : null,
    state: clampStr(marker.state, 32),
    summary: clampStr(marker.summary, 280),
    at: ctx.nowIso,
  });
  const cap = CHARGEBACK_POSTING_LIMITS.markers;
  if (draft.chargebackPostingMarkers.length > cap) {
    draft.chargebackPostingMarkers.splice(0, draft.chargebackPostingMarkers.length - cap);
  }
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  const clean = clampStr(summary, 280);
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ ruleId: CHARGEBACK_POSTING_RULE_ID, rule: CHARGEBACK_POSTING_RULE_ID, action, entity, entityId, summary: clean });
  }
  out.push({ ruleId: CHARGEBACK_POSTING_RULE_ID, action, targetType: entity, targetId: entityId, summary: clean });
}

/** All statement claims hold for one operator-view report. */
function statementPostable(report) {
  const b = report.board;
  return Boolean(report.window.valid) && report.verdict !== 'inert'
    && b.statementComplete === true && b.zeroSum.holds === true
    && b.shareDaysReconcile === true && b.periodLedgerIdentity !== false && b.arithmeticSafe === true;
}

export function chargebackPostingRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!CHARGEBACK_POSTING_TRIGGER_EVENTS.has(eventType)) return [];
  // O(1) inertness: with no price act on record, no statement can be complete,
  // and with no posting act there is nothing to close either.
  if (!draft || !Array.isArray(draft.transferPriceActs) || draft.transferPriceActs.length === 0) return [];

  const conv = normalizeChargebackPostingSettings(draft.settings || {});
  const explicit = eventType === CHARGEBACK_POSTING_EVENTS.SCAN;
  if (!explicit && conv.chargebackPostingAutoPropagate === false) return [];

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
  const report = buildTransferPriceLedger(view, { now: at, settings: operator });
  const window = report.window;
  const { liveByKey } = compileChargebackPostings(draft.chargebackPostings || []);
  const reversalsFor = (from, to, currency) => (draft.chargebackPostings || [])
    .filter((a) => a && a.kind === 'reverse')
    .filter((a) => {
      const post = (draft.chargebackPostings || []).find((p) => p && p.kind === 'post' && p.id === a.postingId);
      return post && post.periodFrom === from && post.periodTo === to && post.currency === currency;
    }).length;

  const onRoster = (id) => Boolean(id) && id !== LEADER_ID && matrix.roster.has(id);
  const nameOf = (id) => (id === LEADER_ID ? (matrix.nodes.get(LEADER_ID)?.name || 'the workspace leader') : (matrix.roster.get(id)?.name || id));

  // The asks this rule issued that are still open, read once.
  const openAsks = [];
  if (Array.isArray(draft.chargebackPostingMarkers) && Array.isArray(draft.delegations)) {
    const activeById = new Map();
    for (const d of draft.delegations) if (d && d.status === 'active') activeById.set(d.id, d);
    for (const marker of draft.chargebackPostingMarkers) {
      if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
      const task = activeById.get(marker.taskId);
      if (task) openAsks.push({ marker, task });
    }
  }
  /** (quarter, currency) → the subject of the ask still open for it, whatever generation issued it. */
  const openPostSubject = new Map();
  for (const { marker } of openAsks) {
    const parsed = parsePostSubject(marker.subjectKey);
    if (parsed) openPostSubject.set(periodCurrencyKey(parsed.from, parsed.to, parsed.currency), marker.subjectKey);
  }

  /** subjectKey → what is owed RIGHT NOW. */
  const owed = new Map();
  const observations = [];

  if (window.valid && statementPostable(report)) {
    for (const row of report.board.currencies) {
      if ((row.chargedCents || 0) === 0) continue;
      const key = periodCurrencyKey(window.from, window.to, row.currency);
      const liveIds = liveByKey.get(key) || [];
      if (liveIds.length > 0) continue; // posted (or conflicted — a human problem the panel prints; not re-asked over)
      const generation = reversalsFor(window.from, window.to, row.currency);
      const scope = `post|${window.from}..${window.to}|${row.currency}`;
      const subjectKey = openPostSubject.get(key) || `${scope}|g${generation}`;
      // The one seat both sides of every internal charge roll up to.
      const accountIds = [...statementAccountCents(report, row.currency).keys()];
      const apex = matrixJointApex(matrix, accountIds);
      if (!apex.unique || apex.isLeaderOnly || !onRoster(apex.apexId)) {
        observations.push({
          subjectKey,
          state: apex.isLeaderOnly || apex.apexId === LEADER_ID ? 'leader-apex' : apex.unique ? 'off-roster-apex' : 'ambiguous-apex',
          summary: `The ${window.from}–${window.to} statement in ${row.currency} (${formatCents(row.chargedCents)} charged) is complete and unposted, and the lines it names have ${apex.unique ? (apex.isLeaderOnly ? 'only the workspace leader' : 'an off-roster seat') : 'no unique joint apex'} above them; no task was addressed to anybody else.`,
        });
        continue;
      }
      owed.set(subjectKey, {
        askedId: apex.apexId,
        state: 'unposted',
        currency: row.currency,
        title: `Post the ${window.from}–${window.to} chargeback statement (${row.currency})`,
        outcome: (dueOn) => `By ${dueOn}, post the complete cross-line chargeback statement for ${window.from} to ${window.to} in ${row.currency} — ${formatCents(row.chargedCents)} charged across ${accountIds.length} line account(s), netting to zero — binding each line’s figure to its budget envelope or declaring in writing that it has none (#/matrix?panel=postings). Until it is posted, the figures are a reading anyone may silently restate, not a period fact; if posting is wrong, record why and reverse nothing — this ask closes when the quarter is posted or its statement regresses.`,
        edgeSummary: 'A complete, unposted chargeback quarter rolls up to this seat.',
      });
    }
  }

  const out = [];
  let closedN = 0;
  const openSubjects = new Set();

  // Close asks that are PROVABLY no longer owed, with the actual reason.
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
    const parsed = parsePostSubject(marker.subjectKey);
    if (!parsed) return null;
    const key = periodCurrencyKey(parsed.from, parsed.to, parsed.currency);
    if ((liveByKey.get(key) || []).length > 0) return `the ${parsed.from}–${parsed.to} statement in ${parsed.currency} was posted`;
    const read = readQuarter(parsed.from, parsed.to);
    if (!read) return null;
    if (!read.window.valid) return null;
    if (!statementPostable(read)) return `the ${parsed.from}–${parsed.to} statement is no longer complete, so there is nothing postable; the missing prices are ${'RULE-TPL-01'}’s asks, not this one`;
    const row = read.board.currencies.find((c) => c.currency === parsed.currency && (c.chargedCents || 0) > 0);
    if (!row) return `no charged cent in ${parsed.currency} is read for ${parsed.from} to ${parsed.to} any more`;
    const apex = matrixJointApex(matrix, [...statementAccountCents(read, parsed.currency).keys()]);
    if (!apex.unique || apex.apexId !== task.personId || !onRoster(apex.apexId)) return 'the joint apex of the statement’s lines is no longer the seat this ask was addressed to';
    return null;
  };
  for (const { marker, task } of openAsks) {
    const still = owed.get(marker.subjectKey);
    if (still && still.askedId === task.personId) {
      openSubjects.add(marker.subjectKey);
      continue;
    }
    const reason = still ? 'the seat it was addressed to is no longer the joint apex of the statement’s lines' : settledReason(marker, task);
    if (!reason) {
      openSubjects.add(marker.subjectKey);
      continue;
    }
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `Closed by ${CHARGEBACK_POSTING_RULE_ID} on ${today}: ${reason}. Nothing was posted, reversed or bound on anyone’s behalf.`.slice(0, 2000);
    task.updatedAt = hookCtx.nowIso;
    closedN += 1;
  }

  // Issue bounded asks.
  let issuedN = 0;
  let deferredN = 0;
  let linkN = 0;
  let observedN = 0;
  const dueOn = addDays(today, conv.chargebackPostingAskDueDays);
  for (const [subjectKey, ask] of owed) {
    if (openSubjects.has(subjectKey)) continue;
    const markerKey = `ask|${subjectKey}`;
    // One ask per (quarter, currency) per generation, ever: a seat that closed
    // or returned it is not asked again until a reversal opens a new generation.
    if (draft.chargebackPostingMarkers?.some((m) => m && m.key === markerKey)) continue;
    if (issuedN >= CHARGEBACK_POSTING_LIMITS.asksPerCommit) { deferredN += 1; continue; }

    const taskId = hookCtx.idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: ask.askedId,
      title: ask.title.slice(0, 200),
      expectedOutcome: ask.outcome(dueOn).slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${CHARGEBACK_POSTING_RULE_ID}. This ask blocks nothing, posts nothing and binds nothing. It closes automatically once the quarter is posted in this currency, or once its statement is no longer complete.`,
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

    const node = matrix.nodes.get(ask.askedId);
    for (const ancestorId of [...((node && node.ancestors) || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      const made = ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', summary: 'A chargeback posting ask rolls up to this leadership span.',
        ruleId: CHARGEBACK_POSTING_RULE_ID,
      }, linkCtx);
      if (made.created) linkN += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey, kind: 'ask', subjectKey, taskId, state: ask.state,
      summary: `Issued chargeback posting ask ${taskId} to ${ask.askedId} (${nameOf(ask.askedId)}) for ${ask.currency}.`,
    });
    openSubjects.add(subjectKey);
    issuedN += 1;
  }

  // A quarter nobody on the roster can be asked for: observed, never substituted.
  for (const obs of observations) {
    if (recordMarker(draft, hookCtx, { key: `obs|${obs.subjectKey}`, kind: 'observation', subjectKey: obs.subjectKey, taskId: null, state: obs.state, summary: obs.summary })) observedN += 1;
  }

  if (closedN > 0) noteEffect(hookCtx, out, 'completed', 'delegation', 'chargeback-postings', `Closed ${closedN} chargeback posting ask(s) that are no longer owed.`);
  if (issuedN > 0) noteEffect(hookCtx, out, 'delegated', 'delegation', 'chargeback-postings', `Issued ${issuedN} chargeback posting ask(s) to the joint apex of the statement’s lines, due by ${dueOn}.`);
  if (linkN > 0) noteEffect(hookCtx, out, 'linked', 'link', 'chargeback-postings', `Recorded ${linkN} typed provenance edge(s) for chargeback posting asks.`);
  if (observedN > 0) noteEffect(hookCtx, out, 'observed', 'chargebackPostingMarkers', 'chargeback-postings', `Recorded ${observedN} observation(s) for complete quarters whose lines have no unique roster apex.`);
  if (deferredN > 0) noteEffect(hookCtx, out, 'deferred', 'workspace', 'chargeback-postings', `Deferred ${deferredN} chargeback posting ask(s) beyond the per-commit cap (${CHARGEBACK_POSTING_LIMITS.asksPerCommit}); run Scan to issue the remainder.`);
  return out;
}

chargebackPostingRule.id = 'chargebackPostingRule';
chargebackPostingRule.triggers = CHARGEBACK_POSTING_TRIGGER_EVENTS;
