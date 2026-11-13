/**
 * app/core/domain/chargebackPosting.js — the Chargeback Period Posting &
 * Budget-Envelope Binding read model (ADR-0194, Schema v154). Pure module: no
 * DOM, no storage, no clock beyond the injected `now`.
 *
 * THE DUTY, at the chief's altitude. ADR-0177 answers "what does each line owe
 * the line that lent it people?". This module answers the period-close
 * questions that come after the statement finally reads complete:
 *
 *  - Has the closed quarter actually been POSTED — turned into a dated period
 *    fact — or is it still only a reading anyone may quietly re-derive?
 *  - WHICH budget envelope does each line's internal charge or credit stand
 *    against, and which lines have none, declared in writing?
 *  - Does the record, as it reads TODAY, still reproduce every posted cent —
 *    and where it does not, exactly which account moved by exactly how much?
 *
 * Named discipline: SAP CO period-end closing is the reference practice —
 * internal allocations are posted as dated, zero-sum, reversible documents and
 * a closed period is corrected by a dated reversal, never by editing history.
 * Two deliberate departures, both printed: (1) an INCOMPLETE statement is not
 * postable at all (CO allocates at plan rates and corrects later; this ledger
 * refuses instead), and (2) nothing is written into the envelopes' own
 * arithmetic — an internal credit is not negative spend, so the join to
 * ADR-0142's envelopes is printed BESIDE them, labelled, exactly as ADR-0142
 * prints matrix overlap instead of splitting money.
 *
 * Honesty boundaries enforced in code, not prose:
 *  - Every audit comparison is integer equality on cents. No tolerance.
 *  - Drift, binding decay and regression are REPORTED, never corrected.
 *  - Currencies are never pooled; no exchange rate exists anywhere here.
 *  - Accounts outside the reading seat are counted and withheld, never shown.
 *  - A duplicate live posting makes the pair CONFLICTED; neither is picked.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildTransferPriceLedger } from './transferPrice.js';
import { formatCents, inclusiveDays } from './transferPriceSchema.js';
import {
  CHARGEBACK_AUDIT_LABELS,
  CHARGEBACK_AUDIT_REASONS,
  CHARGEBACK_AUDIT_TONES,
  CHARGEBACK_BINDING_LABELS,
  CHARGEBACK_BINDING_REASONS,
  CHARGEBACK_BINDING_TONES,
  CHARGEBACK_POSTING_ENGINE_VERSION,
  CHARGEBACK_POSTING_LIMITS,
  CHARGEBACK_POSTING_LIMITS_TEXT,
  CHARGEBACK_POSTING_METHOD,
  CHARGEBACK_POSTING_QUESTIONS,
  CHARGEBACK_POSTING_RIGHTS,
  CHARGEBACK_POSTING_STATE_LABELS,
  CHARGEBACK_POSTING_STATE_TONES,
  CHARGEBACK_STANDING_LABELS,
  CHARGEBACK_STANDING_TONES,
} from './chargebackPostingRegistry.js';
import { normalizeChargebackPostingSettings } from './chargebackPostingSchema.js';

export const periodCurrencyKey = (from, to, currency) => `${from}..${to}|${currency}`;

/**
 * Compile the acts into documents: each `post` with its `reverse` (if any),
 * plus the live index per (period, currency). Pure function of the acts array.
 */
export function compileChargebackPostings(acts) {
  const posts = new Map();
  for (const act of Array.isArray(acts) ? acts : []) {
    if (!act) continue;
    if (act.kind === 'post') {
      posts.set(act.id, { post: act, reverse: null });
    } else if (act.kind === 'reverse' && posts.has(act.postingId)) {
      posts.get(act.postingId).reverse = act;
    }
  }
  const liveByKey = new Map();
  for (const doc of posts.values()) {
    if (doc.reverse) continue;
    const key = periodCurrencyKey(doc.post.periodFrom, doc.post.periodTo, doc.post.currency);
    if (!liveByKey.has(key)) liveByKey.set(key, []);
    liveByKey.get(key).push(doc.post.id);
  }
  return { posts, liveByKey };
}

/** The operator-view (whole-workspace) statement for one window. */
function operatorStatement(state, { from, to, now }) {
  const operator = { ...(state.settings || {}), activeSeatId: null };
  return buildTransferPriceLedger({ ...state, settings: operator }, { from, to, now, settings: operator });
}

/** accountId → { chargedCents, creditedCents } in ONE currency, from an operator statement. */
export function statementAccountCents(report, currency) {
  const map = new Map();
  for (const account of report.accounts || []) {
    const row = (account.currencies || []).find((c) => c.currency === currency);
    if (!row) continue;
    if ((row.chargedCents || 0) === 0 && (row.creditedCents || 0) === 0) continue;
    map.set(account.accountId, { chargedCents: row.chargedCents || 0, creditedCents: row.creditedCents || 0 });
  }
  return map;
}

const binding = (state) => ({
  state,
  label: CHARGEBACK_BINDING_LABELS[state],
  tone: CHARGEBACK_BINDING_TONES[state],
  reason: CHARGEBACK_BINDING_REASONS[state],
});

/** Re-check one frozen binding against the live budget record. Reported, never re-pointed. */
export function bindingStateFor(row, budgetsById, currency) {
  if (!row.envelopeId) return 'no-envelope';
  const budget = budgetsById.get(row.envelopeId) || null;
  if (!budget) return 'envelope-missing';
  if (budget.ownerId !== row.accountId) return 'owner-changed';
  if (budget.currency !== currency) return 'currency-changed';
  if (budget.status !== 'active') return 'envelope-inactive';
  return 'bound';
}

export function buildChargebackPostingLedger(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeChargebackPostingSettings(cfg);

  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now: at, settings: cfg, lineScope: lineScope.byManager.size ? lineScope.byManager : null });
  const seat = activeSeat(built);
  const full = Boolean(seat.fullAccess);
  const readableAccount = (id) => full || (!seat.readOnly && Boolean(id) && (id === seat.id || Boolean(seat.scope?.has?.(id)) || Boolean(seat.lineScope?.has?.(id))));
  const peopleById = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const rawName = (id) => {
    if (!id) return 'Unknown';
    if (id === LEADER_ID) return matrix.nodes.get(LEADER_ID)?.name || 'Workspace leader';
    return matrix.roster.get(id)?.name || peopleById.get(id)?.name || id;
  };
  const budgetsById = new Map((Array.isArray(state.budgets) ? state.budgets : []).filter((b) => b && b.id).map((b) => [b.id, b]));

  const acts = Array.isArray(state.chargebackPostings) ? state.chargebackPostings : [];
  const { posts, liveByKey } = compileChargebackPostings(acts);

  /* 1. The default-quarter standing, read whole-workspace. */
  const quarterReport = operatorStatement(state, { from: null, to: null, now: at });
  const qWindow = quarterReport.window;
  const qBoard = quarterReport.board;
  const statementPostable = Boolean(qWindow.valid)
    && qBoard.statementComplete === true
    && qBoard.zeroSum.holds === true
    && qBoard.shareDaysReconcile === true
    && qBoard.periodLedgerIdentity !== false
    && qBoard.arithmeticSafe === true;

  /* 2. Audit every posting against a re-derivation of its OWN period. */
  const reportCache = new Map();
  const statementFor = (from, to) => {
    if (qWindow.valid && from === qWindow.from && to === qWindow.to) return quarterReport;
    const key = `${from}..${to}`;
    if (!reportCache.has(key)) reportCache.set(key, operatorStatement(state, { from, to, now: at }));
    return reportCache.get(key);
  };

  const auditCounts = { faithful: 0, drifted: 0, 'statement-regressed': 0, 'window-unreadable': 0, 'not-audited': 0 };
  const bindingCounts = { bound: 0, 'no-envelope': 0, decayed: 0 };
  let rowsTotalN = 0;
  let rowsWithheldN = 0;
  const postingRows = [];

  const sortedDocs = [...posts.values()].sort((a, b) => String(b.post.at).localeCompare(String(a.post.at)) || String(a.post.id).localeCompare(String(b.post.id)));
  for (const doc of sortedDocs) {
    const post = doc.post;
    const key = periodCurrencyKey(post.periodFrom, post.periodTo, post.currency);
    const stateKey = doc.reverse ? 'reversed' : 'posted';
    const conflicted = !doc.reverse && (liveByKey.get(key) || []).length > 1;

    /* 2a. Audit. */
    let verdict;
    let auditDetail = null;
    const drifts = [];
    let driftsOmittedN = 0;
    if (doc.reverse) {
      verdict = 'not-audited';
    } else {
      const current = statementFor(post.periodFrom, post.periodTo);
      if (!current.window.valid) {
        verdict = 'window-unreadable';
        auditDetail = current.window.refuseReason || null;
      } else if (current.board.statementComplete !== true) {
        verdict = 'statement-regressed';
        auditDetail = current.board.incompleteReason || null;
      } else {
        const currentCents = statementAccountCents(current, post.currency);
        const frozenIds = new Set(post.rows.map((r) => r.accountId));
        let clean = true;
        for (const row of post.rows) {
          const liveRow = currentCents.get(row.accountId) || { chargedCents: 0, creditedCents: 0 };
          for (const field of ['chargedCents', 'creditedCents']) {
            if (liveRow[field] !== row[field]) {
              clean = false;
              if (drifts.length < CHARGEBACK_POSTING_LIMITS.drifts) {
                const shown = readableAccount(row.accountId);
                drifts.push({
                  accountId: shown ? row.accountId : null,
                  accountName: shown ? rawName(row.accountId) : 'A line outside this seat',
                  field: field === 'chargedCents' ? 'charged' : 'credited',
                  postedCents: row[field],
                  currentCents: liveRow[field],
                  posted: formatCents(row[field]),
                  current: formatCents(liveRow[field]),
                  deltaCents: liveRow[field] - row[field],
                });
              } else driftsOmittedN += 1;
            }
          }
        }
        let accountsNewN = 0;
        for (const accountId of currentCents.keys()) {
          if (!frozenIds.has(accountId)) { clean = false; accountsNewN += 1; }
        }
        verdict = clean ? 'faithful' : 'drifted';
        if (accountsNewN) auditDetail = `${accountsNewN} line account(s) now carry money in this period and currency that the posting did not name.`;
      }
    }
    auditCounts[verdict] += 1;

    /* 2b. Bindings, re-checked against the live envelopes. */
    const rows = [];
    let boundN = 0;
    let noEnvelopeN = 0;
    let decayedN = 0;
    let withheldHereN = 0;
    for (const row of post.rows) {
      rowsTotalN += 1;
      const bState = bindingStateFor(row, budgetsById, post.currency);
      if (bState === 'bound') { bindingCounts.bound += 1; boundN += 1; } else if (bState === 'no-envelope') { bindingCounts['no-envelope'] += 1; noEnvelopeN += 1; } else { bindingCounts.decayed += 1; decayedN += 1; }
      const shown = readableAccount(row.accountId);
      if (!shown) { rowsWithheldN += 1; withheldHereN += 1; continue; }
      const budget = row.envelopeId ? budgetsById.get(row.envelopeId) || null : null;
      rows.push({
        accountId: row.accountId,
        accountName: rawName(row.accountId),
        isLeader: row.accountId === LEADER_ID,
        chargedCents: row.chargedCents,
        creditedCents: row.creditedCents,
        charged: formatCents(row.chargedCents),
        credited: formatCents(row.creditedCents),
        envelopeId: row.envelopeId,
        envelopeName: budget ? (budget.name || row.envelopeId) : null,
        envelopeStatus: budget ? budget.status : null,
        noEnvelopeReason: row.noEnvelopeReason || '',
        binding: binding(bState),
      });
    }
    rows.sort((a, b) => (b.chargedCents + b.creditedCents) - (a.chargedCents + a.creditedCents) || String(a.accountName).localeCompare(String(b.accountName)));

    const zeroSum = post.totalChargedCents === post.totalCreditedCents;
    postingRows.push({
      id: post.id,
      state: stateKey,
      stateLabel: CHARGEBACK_POSTING_STATE_LABELS[stateKey],
      stateTone: CHARGEBACK_POSTING_STATE_TONES[stateKey],
      conflicted,
      periodFrom: post.periodFrom,
      periodTo: post.periodTo,
      periodDays: inclusiveDays(post.periodFrom, post.periodTo),
      currency: post.currency,
      postedOn: post.decidedOn,
      at: post.at,
      via: post.via,
      decidedBySeatId: post.decidedBySeatId,
      note: post.note,
      reversedOn: doc.reverse ? doc.reverse.decidedOn : null,
      reverseReason: doc.reverse ? doc.reverse.reason : '',
      reversedVia: doc.reverse ? doc.reverse.via : null,
      totalChargedCents: post.totalChargedCents,
      totalCreditedCents: post.totalCreditedCents,
      totalCharged: formatCents(post.totalChargedCents),
      totalCredited: formatCents(post.totalCreditedCents),
      zeroSum,
      entriesN: post.entriesN,
      pricedShareDays: post.pricedShareDays,
      claims: { ...post.claims },
      engineVersion: post.engineVersion,
      audit: {
        verdict,
        label: CHARGEBACK_AUDIT_LABELS[verdict],
        tone: CHARGEBACK_AUDIT_TONES[verdict],
        reason: CHARGEBACK_AUDIT_REASONS[verdict],
        detail: auditDetail,
        drifts,
        driftsOmittedN,
      },
      rowsN: post.rows.length,
      rows,
      rowsWithheldN: withheldHereN,
      boundN,
      noEnvelopeN,
      decayedN,
    });
  }

  /* 3. Quarter standing per currency. */
  const standingCurrencies = [];
  const standingCounts = { postable: 0, posted: 0, 'posted-drifted': 0, conflicted: 0 };
  let quarterState;
  let quarterReason = null;
  if (!qWindow.valid) {
    quarterState = 'not-postable';
    quarterReason = qWindow.refuseReason || 'The default period is refused.';
  } else if (quarterReport.verdict === 'inert') {
    quarterState = 'inert';
    quarterReason = quarterReport.inertNote || 'No chargeable share-day is in scope for the last completed quarter.';
  } else if (!statementPostable) {
    quarterState = 'not-postable';
    quarterReason = qBoard.incompleteReason
      || (qBoard.zeroSum.holds !== true ? 'The workspace does not net to zero.'
        : qBoard.shareDaysReconcile !== true ? 'The share-day partition does not reconcile.'
          : qBoard.periodLedgerIdentity === false ? 'The statement does not reproduce the period ledger it claims to read.'
            : 'The statement is not complete.');
  } else {
    quarterState = 'ready';
    const postingById = new Map(postingRows.map((p) => [p.id, p]));
    for (const row of qBoard.currencies) {
      if ((row.chargedCents || 0) === 0 && (row.creditedCents || 0) === 0) continue;
      const key = periodCurrencyKey(qWindow.from, qWindow.to, row.currency);
      const liveIds = liveByKey.get(key) || [];
      let cState;
      let postingId = null;
      let auditVerdict = null;
      if (liveIds.length > 1) {
        cState = 'conflicted';
      } else if (liveIds.length === 1) {
        postingId = liveIds[0];
        auditVerdict = postingById.get(postingId)?.audit?.verdict || null;
        cState = auditVerdict === 'faithful' ? 'posted' : 'posted-drifted';
      } else {
        cState = 'postable';
      }
      standingCounts[cState] += 1;
      standingCurrencies.push({
        currency: row.currency,
        state: cState,
        stateLabel: CHARGEBACK_STANDING_LABELS[cState],
        stateTone: CHARGEBACK_STANDING_TONES[cState],
        chargedCents: row.chargedCents,
        charged: formatCents(row.chargedCents),
        entriesN: row.entriesN,
        postingId,
        auditVerdict,
      });
    }
    if (!standingCurrencies.length) {
      quarterState = 'inert';
      quarterReason = 'The statement is complete and carries no charged cent in any currency (every priced share-day is at an explicit zero rate, or nets inside one line).';
    }
  }

  /* 4. Open asks RULE-CBP-01 issued. */
  const delegations = Array.isArray(state.delegations) ? state.delegations : [];
  const activeTasks = new Map(delegations.filter((d) => d && d.status === 'active').map((d) => [d.id, d]));
  let openAsksN = 0;
  for (const marker of Array.isArray(state.chargebackPostingMarkers) ? state.chargebackPostingMarkers : []) {
    if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
    if (activeTasks.has(marker.taskId)) openAsksN += 1;
  }

  /* 5. The board. */
  const liveN = postingRows.filter((p) => p.state === 'posted').length;
  const conflictedPostingsN = postingRows.filter((p) => p.conflicted).length;
  const board = {
    postingsN: postingRows.length,
    liveN,
    reversedN: postingRows.length - liveN,
    conflictedN: conflictedPostingsN,
    audits: { ...auditCounts },
    auditsReconcile: Object.values(auditCounts).reduce((a, b) => a + b, 0) === postingRows.length,
    rowsTotalN,
    rowsBoundN: bindingCounts.bound,
    rowsNoEnvelopeN: bindingCounts['no-envelope'],
    rowsDecayedN: bindingCounts.decayed,
    rowsReconcile: bindingCounts.bound + bindingCounts['no-envelope'] + bindingCounts.decayed === rowsTotalN,
    rowsWithheldN,
    standing: { ...standingCounts },
    openAsksN,
  };

  const canPost = !seat.readOnly && (full || canAct(CHARGEBACK_POSTING_RIGHTS.POST, seat).allow === true);
  const govern = canAct(CHARGEBACK_POSTING_RIGHTS.GOVERN, seat);

  return {
    engineVersion: CHARGEBACK_POSTING_ENGINE_VERSION,
    statementEngineVersion: quarterReport.engineVersion,
    generatedOn: today,
    isMatrix: quarterReport.isMatrix || postingRows.length > 0,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: full, readOnly: Boolean(seat.readOnly) },
    scopeLabel: full ? 'the whole workspace' : `${seat.label || seat.id}’s lines and span`,
    actor: {
      seatId: full ? null : seat.id,
      fullAccess: full,
      canPost,
      canReverse: canPost,
      canScan: !seat.readOnly && (full || govern.allow === true),
      canGovern: !seat.readOnly && (full || govern.allow === true),
    },
    conventions: {
      askDueDays: conv.chargebackPostingAskDueDays,
      autoPropagate: conv.chargebackPostingAutoPropagate,
    },
    quarter: {
      from: qWindow.valid ? qWindow.from : null,
      to: qWindow.valid ? qWindow.to : null,
      days: qWindow.valid ? qWindow.days : null,
      state: quarterState,
      stateLabel: quarterState === 'ready' ? 'Complete — postable per currency below' : CHARGEBACK_STANDING_LABELS[quarterState],
      stateTone: quarterState === 'ready' ? 'good' : CHARGEBACK_STANDING_TONES[quarterState],
      reason: quarterReason,
      statementVerdict: quarterReport.verdict,
      statementComplete: qBoard.statementComplete === true,
      claims: {
        statementComplete: qBoard.statementComplete === true,
        zeroSum: qBoard.zeroSum.holds,
        shareDaysReconcile: qBoard.shareDaysReconcile,
        periodLedgerIdentity: qBoard.periodLedgerIdentity,
        arithmeticSafe: qBoard.arithmeticSafe,
      },
      currencies: standingCurrencies,
    },
    postings: postingRows.slice(0, CHARGEBACK_POSTING_LIMITS.postings),
    postingsOmittedN: Math.max(0, postingRows.length - CHARGEBACK_POSTING_LIMITS.postings),
    board,
    method: CHARGEBACK_POSTING_METHOD,
    limits: CHARGEBACK_POSTING_LIMITS_TEXT,
    questions: CHARGEBACK_POSTING_QUESTIONS,
    inertNote: quarterState === 'inert' && postingRows.length === 0
      ? 'Nothing has ever been posted and the last completed quarter carries nothing to post. A single-chain workspace gains no row, no figure and no refusal.'
      : null,
  };
}

/* ---------------------------------------------------------------- the brief */

/** The identity-free brief. Counts and totals only: no person, manager, envelope or note. */
export function chargebackPostingBriefText(report) {
  const b = report.board;
  const q = report.quarter;
  const lines = [
    `Chargeback period postings — generated ${report.generatedOn} for ${report.scopeLabel}.`,
    `Postings on the ledger: ${b.postingsN} (${b.liveN} live, ${b.reversedN} reversed${b.conflictedN ? `, ${b.conflictedN} CONFLICTED` : ''}).`,
    `Today’s re-derivation: ${b.audits.faithful} faithful, ${b.audits.drifted} drifted, ${b.audits['statement-regressed']} statement-regressed, ${b.audits['window-unreadable']} period-unreadable, ${b.audits['not-audited']} reversed (not audited).`,
    `Posted lines: ${b.rowsTotalN} — ${b.rowsBoundN} bound to a budget envelope, ${b.rowsNoEnvelopeN} declared no-envelope, ${b.rowsDecayedN} with a DECAYED binding.`,
    q.from
      ? `Last completed quarter (${q.from} to ${q.to}): ${q.state === 'ready' ? `statement complete — ${q.currencies.map((c) => `${c.currency}: ${c.stateLabel.toLowerCase()}`).join('; ') || 'nothing to post'}` : `${q.stateLabel}${q.reason ? ` — ${q.reason}` : ''}`}`
      : `Last completed quarter: ${q.stateLabel}${q.reason ? ` — ${q.reason}` : ''}`,
    `Open posting asks (RULE-CBP-01): ${b.openAsksN}.`,
    'A posting freezes the complete statement against named envelopes; it writes no budget line and changes no envelope figure. Drift and binding decay are reported, never corrected.',
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------ the CSV */

/** CSV scope #146. Aggregate and identity-free; a withheld figure is BLANK, never zero. */
export function chargebackPostingCsvRows(report) {
  const b = report.board;
  const q = report.quarter;
  const empty = {
    period_from: '', period_to: '', period_days: '', currency: '', posting_state: '', audit_verdict: '',
    posted_on: '', reversed_on: '', via: '', rows_n: '', rows_bound_n: '', rows_no_envelope_n: '', rows_decayed_n: '',
    entries: '', priced_share_days: '', total_charged_cents: '', total_credited_cents: '',
    total_charged: '', total_credited: '', zero_sum: '',
  };
  const rows = [{
    row_type: 'workspace',
    generated_on: report.generatedOn,
    scope: report.actor.fullAccess ? 'workspace' : 'seat',
    postings: b.postingsN,
    postings_live: b.liveN,
    postings_reversed: b.reversedN,
    postings_conflicted: b.conflictedN,
    audits_faithful: b.audits.faithful,
    audits_drifted: b.audits.drifted,
    audits_statement_regressed: b.audits['statement-regressed'],
    audits_window_unreadable: b.audits['window-unreadable'],
    audits_not_audited: b.audits['not-audited'],
    audits_reconcile: b.auditsReconcile,
    rows_total: b.rowsTotalN,
    rows_bound: b.rowsBoundN,
    rows_no_envelope: b.rowsNoEnvelopeN,
    rows_decayed: b.rowsDecayedN,
    rows_reconcile: b.rowsReconcile,
    quarter_from: q.from || '',
    quarter_to: q.to || '',
    quarter_state: q.state,
    quarter_reason: q.state === 'ready' ? '' : (q.reason || ''),
    currencies_postable: b.standing.postable,
    currencies_posted: b.standing.posted,
    currencies_posted_drifted: b.standing['posted-drifted'],
    currencies_conflicted: b.standing.conflicted,
    open_asks: b.openAsksN,
    ...empty,
    engine_version: report.engineVersion,
  }];
  for (const p of report.postings) {
    rows.push({
      row_type: 'posting',
      generated_on: report.generatedOn,
      scope: report.actor.fullAccess ? 'workspace' : 'seat',
      postings: '', postings_live: '', postings_reversed: '', postings_conflicted: '',
      audits_faithful: '', audits_drifted: '', audits_statement_regressed: '', audits_window_unreadable: '', audits_not_audited: '', audits_reconcile: '',
      rows_total: '', rows_bound: '', rows_no_envelope: '', rows_decayed: '', rows_reconcile: '',
      quarter_from: '', quarter_to: '', quarter_state: '', quarter_reason: '',
      currencies_postable: '', currencies_posted: '', currencies_posted_drifted: '', currencies_conflicted: '',
      open_asks: '',
      period_from: p.periodFrom,
      period_to: p.periodTo,
      period_days: p.periodDays === null ? '' : p.periodDays,
      currency: p.currency,
      posting_state: p.conflicted ? 'conflicted' : p.state,
      audit_verdict: p.audit.verdict,
      posted_on: p.postedOn,
      reversed_on: p.reversedOn || '',
      via: p.via,
      rows_n: p.rowsN,
      rows_bound_n: p.boundN,
      rows_no_envelope_n: p.noEnvelopeN,
      rows_decayed_n: p.decayedN,
      entries: p.entriesN,
      priced_share_days: p.pricedShareDays,
      total_charged_cents: p.totalChargedCents,
      total_credited_cents: p.totalCreditedCents,
      total_charged: p.totalCharged,
      total_credited: p.totalCredited,
      zero_sum: p.zeroSum,
      engine_version: p.engineVersion,
    });
  }
  return rows;
}
