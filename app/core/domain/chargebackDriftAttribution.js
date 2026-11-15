/**
 * app/core/domain/chargebackDriftAttribution.js — which dated acts landed on a
 * posted period between the posting and today (ADR-0203, Schema v158
 * unchanged: attribution is derived on read and stores nothing). Pure module:
 * no DOM, no storage, no clock beyond the injected `now`.
 *
 * THE DUTY, in the operator's words. ADR-0202 made a restated period a dated
 * decision: the drift is fingerprinted to the cent and one ask goes to the
 * posting's own apex. But the leader answering that ask was told WHAT moved and
 * not WHAT LANDED: the voided price? the retro retune? the roster repair? The
 * audit prints the delta and stops. So the decision gets made on a delta with
 * no history beside it — and in a matrix, where one person's share is priced on
 * two lines at once, "which act moved it" is exactly the question a reader
 * cannot answer by eye.
 *
 * THE JOIN. The drift window is the posting's own instant to today. Every act
 * that can change a statement figure is a dated event on the workspace log:
 * a confirmed or retired two-key price (ADR-0177), a declared, retuned or ended
 * reporting line (ADR-0140), a changed person record. Each in-window act of
 * those families is resolved to the line accounts it can touch — from the
 * record itself, never from a title or a guess — and compared against the
 * accounts this posting froze plus the accounts its drift names. What survives
 * is printed as a CANDIDATE.
 *
 * THREE HONESTY BOUNDARIES, enforced here and not in prose:
 *  1. A candidate is never a culprit. The link proves the act was inside the
 *     window and touches an account whose cents moved. It does not prove the
 *     act moved them, and no candidate is ranked above another, scored, or
 *     attached to a person.
 *  2. Only acts that price or re-share something are candidates. A
 *     `transfer.price.proposed` prices nothing — `compileTransferPrices` gives
 *     a proposal no cover — so a proposal is counted as not-figure-moving and
 *     the confirmation that made it a price is the candidate. An act outside
 *     the posting's own period is counted, never listed.
 *  3. Where the log cannot see back to the posting, the join is REFUSED with
 *     the reason printed. The workspace event log is bounded and evicts
 *     oldest-first (`capEvents` in store.js), so the surviving log is a SUFFIX
 *     of the full log: if the oldest survivor is at or before the posting
 *     instant, nothing inside the window was evicted, and coverage is a proof
 *     rather than an assumption. Otherwise an empty candidate list would read
 *     as "nothing happened" when the truth is "the start of the window is
 *     gone", which is the exact failure the Bulletproof Reliability Mandate
 *     forbids.
 *
 * An act logged at the SAME instant as the posting cannot be ordered against
 * it; it is printed `unordered` rather than silently placed before or after.
 *
 * Named discipline: this is the internal-record analogue of a general-ledger
 * drill-down over a closed period (SAP CO line-item reports; BlackLine Account
 * Analysis / variance drill-down). Those systems list the posted journal lines
 * behind a balance. This ledger has no journal lines — its figures are derived
 * (declared share-days × two-key prices) — so it lists the dated ACTS that can
 * move the derivation, states the link it could prove for each, and refuses
 * rather than implying completeness the log cannot support.
 */

import { dayKey } from '../time.js';
import { compileTransferPrices } from './transferPrice.js';
import { formatCents, inclusiveDays } from './transferPriceSchema.js';
import {
  CHARGEBACK_DRIFT_ACT_FAMILIES,
  CHARGEBACK_DRIFT_ATTRIBUTION_LABELS,
  CHARGEBACK_DRIFT_ATTRIBUTION_REASONS,
  CHARGEBACK_DRIFT_ATTRIBUTION_TONES,
  CHARGEBACK_DRIFT_COVERAGE_BASIS,
  CHARGEBACK_DRIFT_LINK_LABELS,
  CHARGEBACK_DRIFT_LINK_TONES,
  CHARGEBACK_POSTING_LIMITS,
} from './chargebackPostingRegistry.js';

/** Event type → family. A type absent here cannot move a statement figure. */
export const DRIFT_ACT_FAMILY_OF_EVENT = Object.freeze(Object.fromEntries(
  Object.entries(CHARGEBACK_DRIFT_ACT_FAMILIES).flatMap(([family, def]) => def.events.map((type) => [type, family])),
));

/** Day-key windows are inclusive and compare lexicographically. */
const overlaps = (aFrom, aTo, bFrom, bTo) => Boolean(aFrom && aTo && bFrom && bTo) && aFrom <= bTo && bFrom <= aTo;

const shape = (verdict, extra = {}) => ({
  verdict,
  label: CHARGEBACK_DRIFT_ATTRIBUTION_LABELS[verdict],
  tone: CHARGEBACK_DRIFT_ATTRIBUTION_TONES[verdict],
  reason: CHARGEBACK_DRIFT_ATTRIBUTION_REASONS[verdict],
  detail: null,
  window: null,
  coverage: null,
  candidates: [],
  candidatesOmittedN: 0,
  movedAccountsN: 0,
  counts: {
    windowEventsN: 0, candidatesN: 0, linkedN: 0, unlinkedN: 0, unresolvedN: 0,
    unorderedN: 0, outOfPeriodN: 0, notFigureMovingN: 0, unattributableN: 0, outsideFamilyN: 0,
  },
  countsReconcile: true,
  ...extra,
});

/**
 * Can the surviving event log see the whole window? A proof, not an
 * assumption: ordinary events are evicted oldest-first, so the survivors form a
 * suffix of the full log — one oldest survivor at or before the posting instant
 * means nothing inside the window was dropped.
 */
export function eventLogCoverage(events, { postedAt = null, now = null } = {}) {
  const list = Array.isArray(events) ? events.filter((e) => e && typeof e.ts === 'string' && e.ts) : [];
  if (!postedAt || !now) return { state: 'refused', basis: 'no-window', basisText: CHARGEBACK_DRIFT_COVERAGE_BASIS['no-window'], earliestEventAt: null };
  if (postedAt > now) return { state: 'refused', basis: 'no-window', basisText: CHARGEBACK_DRIFT_COVERAGE_BASIS['no-window'], earliestEventAt: null };
  if (!list.length) return { state: 'refused', basis: 'empty', basisText: CHARGEBACK_DRIFT_COVERAGE_BASIS.empty, earliestEventAt: null };
  let earliestEventAt = null;
  for (const e of list) if (earliestEventAt === null || e.ts < earliestEventAt) earliestEventAt = e.ts;
  if (earliestEventAt > postedAt) {
    return { state: 'refused', basis: 'truncated', basisText: CHARGEBACK_DRIFT_COVERAGE_BASIS.truncated, earliestEventAt };
  }
  return { state: 'covered', basis: 'covered', basisText: CHARGEBACK_DRIFT_COVERAGE_BASIS.covered, earliestEventAt };
}

/**
 * The attribution of ONE drifted posting.
 *
 * @param post  the frozen posting act (`rows`, `periodFrom/To`, `at`).
 * @param drift the `auditPostingDrift` result for that posting — the entries
 *              are the moved cents; a posting with no drift is not attributed.
 * @param state the workspace (events, reportingLines, transferPriceActs, people).
 * @param readable / nameOf  the reading seat's disclosure, exactly as the
 *              reader applies it to every other account figure: an account
 *              outside the seat is counted and withheld, never shown.
 */
export function attributePostingDrift({
  post = null, drift = null, state = {}, now = new Date(),
  readable = () => true, nameOf = (id) => id,
} = {}) {
  if (!post || !drift || drift.verdict !== 'drifted' || !drift.signature) {
    return shape('not-run');
  }
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const postedAt = typeof post.at === 'string' ? post.at : null;
  const nowIso = at.toISOString();

  /* The accounts this posting froze, and the accounts its drift names. A
   * `new-account` entry is by definition NOT frozen, so the link set is the
   * union — otherwise the act that put money on a brand-new account would read
   * as unlinked, which is the opposite of the truth. */
  const frozen = new Set((post.rows || []).map((r) => r && r.accountId).filter(Boolean));
  const movedByAccount = new Map();
  for (const entry of drift.entries || []) {
    if (!entry || !entry.accountId) continue;
    if (!movedByAccount.has(entry.accountId)) movedByAccount.set(entry.accountId, []);
    movedByAccount.get(entry.accountId).push(entry);
  }
  const relevant = new Set([...frozen, ...movedByAccount.keys()]);

  const events = Array.isArray(state.events) ? state.events.filter((e) => e && typeof e.ts === 'string' && e.ts) : [];
  const coverage = eventLogCoverage(events, { postedAt, now: nowIso });
  const windowFrom = postedAt ? dayKey(new Date(postedAt)) : null;
  const windowTo = dayKey(at);
  const window = postedAt
    ? { fromAt: postedAt, toAt: nowIso, from: windowFrom, to: windowTo, days: inclusiveDays(windowFrom, windowTo) }
    : null;

  if (coverage.state === 'refused') {
    const earliestEventOn = coverage.earliestEventAt ? dayKey(new Date(coverage.earliestEventAt)) : null;
    const detail = earliestEventOn
      ? `The oldest surviving event is ${earliestEventOn}; the posting is dated ${windowFrom || 'an unreadable day'}. ${coverage.basisText}.`
      : `${coverage.basisText}.`;
    return shape('refused', { window, coverage: { ...coverage, earliestEventOn }, detail });
  }

  /* Indexes the join reads. All from the record; nothing inferred from names. */
  const agreements = compileTransferPrices(Array.isArray(state.transferPriceActs) ? state.transferPriceActs : []);
  const lines = (Array.isArray(state.reportingLines) ? state.reportingLines : []).filter((l) => l && l.id);
  const linesById = new Map(lines.map((l) => [l.id, l]));
  const peopleById = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const linesByPerson = new Map();
  for (const l of lines) {
    if (!l.personId) continue;
    if (!linesByPerson.has(l.personId)) linesByPerson.set(l.personId, []);
    linesByPerson.get(l.personId).push(l);
  }
  const lineEnd = (l) => l.toISO || windowTo || '9999-12-31';

  const accountView = (accountId, basis) => {
    const shown = Boolean(accountId) && readable(accountId);
    const entries = movedByAccount.get(accountId) || [];
    return {
      accountId,
      name: shown ? nameOf(accountId) : 'A line outside this seat',
      withheld: !shown,
      basis,
      moved: entries.length > 0,
      fields: entries.map((e) => ({
        field: e.field === 'new-account' ? 'new-account' : e.field === 'chargedCents' ? 'charged' : 'credited',
        postedCents: e.field === 'new-account' ? null : e.postedCents,
        currentCents: e.field === 'new-account' ? null : e.currentCents,
        posted: e.field === 'new-account' ? null : formatCents(e.postedCents),
        current: e.field === 'new-account' ? null : formatCents(e.currentCents),
        deltaCents: e.field === 'new-account' ? null : e.currentCents - e.postedCents,
      })),
    };
  };

  /**
   * Resolve ONE in-window, in-family act to the accounts it can touch, with the
   * basis of each link printed. Returns `{ touched }` or `{ exclusion }`.
   */
  const resolve = (event, family) => {
    const id = typeof event.entityId === 'string' ? event.entityId.trim() : '';
    if (!id) return { exclusion: 'unattributable' };

    if (family === 'price') {
      const agreement = agreements.get(id);
      if (!agreement) return { exclusion: null, link: 'unresolved', touched: [], basis: 'the price agreement this act names is no longer on the record' };
      // A proposal prices nothing, and a withdrawn proposal never priced
      // anything: neither can move a posted cent.
      if (agreement.state !== 'agreed' && agreement.state !== 'voided') return { exclusion: 'not-figure-moving' };
      if (!overlaps(agreement.coverFrom, agreement.coverTo, post.periodFrom, post.periodTo)) return { exclusion: 'out-of-period' };
      const lender = accountView(agreement.lenderId, 'the credit side of this price');
      const borrower = accountView(agreement.borrowerId, 'the charge side of this price');
      return {
        exclusion: null, link: null, touched: [lender, borrower],
        basis: `this agreement prices ${agreement.coverFrom}–${agreement.coverTo} at ${formatCents(agreement.rateCents)} ${agreement.currency} per person-day${agreement.state === 'voided' ? ' and is now voided' : ''}`,
        entityRef: agreement.id,
      };
    }

    if (family === 'line') {
      const line = linesById.get(id);
      if (!line) return { exclusion: null, link: 'unresolved', touched: [], basis: 'the reporting line this act names is no longer on the record' };
      if (!overlaps(line.fromISO, lineEnd(line), post.periodFrom, post.periodTo)) return { exclusion: 'out-of-period' };
      const touched = [accountView(line.managerId, 'the account this line charges')];
      const homeId = peopleById.get(line.personId)?.managerId || null;
      if (homeId && homeId !== line.managerId) touched.push(accountView(homeId, 'the person’s home-line account, as the record reads today'));
      return {
        exclusion: null, link: null, touched,
        basis: `this line runs ${line.fromISO}–${lineEnd(line)}${line.status === 'active' ? '' : ` and is dated out`}`,
        entityRef: null,
      };
    }

    // roster
    const personLines = (linesByPerson.get(id) || []).filter((l) => overlaps(l.fromISO, lineEnd(l), post.periodFrom, post.periodTo));
    const person = peopleById.get(id) || null;
    if (!person && !personLines.length) return { exclusion: null, link: 'unresolved', touched: [], basis: 'neither this person nor any line of theirs is on the record any more' };
    if (!personLines.length) {
      return {
        exclusion: null, link: 'unlinked', touched: [],
        basis: 'the record shows no reporting line of this person inside this posting’s period, so no account can be tied to the act',
        entityRef: null,
      };
    }
    const touched = [];
    const seen = new Set();
    for (const l of personLines) {
      if (!l.managerId || seen.has(l.managerId)) continue;
      seen.add(l.managerId);
      touched.push(accountView(l.managerId, 'the account a line of this person charges'));
    }
    const homeId = person?.managerId || null;
    if (homeId && !seen.has(homeId)) touched.push(accountView(homeId, 'this person’s home-line account, as the record reads today'));
    return {
      exclusion: null, link: null, touched,
      basis: `this person is on ${personLines.length} line(s) inside this posting’s period`,
      entityRef: null,
    };
  };

  const counts = {
    windowEventsN: 0, candidatesN: 0, linkedN: 0, unlinkedN: 0, unresolvedN: 0,
    unorderedN: 0, outOfPeriodN: 0, notFigureMovingN: 0, unattributableN: 0, outsideFamilyN: 0,
  };
  const linked = [];

  for (const event of events) {
    if (event.ts < postedAt || event.ts > nowIso) continue;
    counts.windowEventsN += 1;
    const family = DRIFT_ACT_FAMILY_OF_EVENT[event.type] || null;
    if (!family) { counts.outsideFamilyN += 1; continue; }
    const found = resolve(event, family);
    if (found.exclusion === 'unattributable') { counts.unattributableN += 1; continue; }
    if (found.exclusion === 'out-of-period') { counts.outOfPeriodN += 1; continue; }
    if (found.exclusion === 'not-figure-moving') { counts.notFigureMovingN += 1; continue; }
    counts.candidatesN += 1;
    const unordered = event.ts === postedAt;
    if (unordered) counts.unorderedN += 1;
    const linkState = found.link || (found.touched.some((t) => relevant.has(t.accountId)) ? 'linked' : 'unlinked');
    if (linkState === 'unresolved') { counts.unresolvedN += 1; continue; }
    if (linkState === 'unlinked') { counts.unlinkedN += 1; continue; }
    counts.linkedN += 1;
    const hit = found.touched.filter((t) => relevant.has(t.accountId));
    linked.push({
      eventId: event.id || null,
      type: event.type,
      at: event.ts,
      on: dayKey(new Date(event.ts)),
      unordered,
      family,
      familyLabel: CHARGEBACK_DRIFT_ACT_FAMILIES[family].label,
      entityRef: found.entityRef || null,
      link: {
        state: linkState,
        label: CHARGEBACK_DRIFT_LINK_LABELS[linkState],
        tone: CHARGEBACK_DRIFT_LINK_TONES[linkState],
        basis: found.basis,
        accounts: hit.sort((a, b) => (b.moved ? 1 : 0) - (a.moved ? 1 : 0) || String(a.accountId).localeCompare(String(b.accountId))),
      },
      movedAccountsN: hit.filter((t) => t.moved).length,
    });
  }

  linked.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(a.eventId || '').localeCompare(String(b.eventId || '')));
  const printed = linked.slice(0, CHARGEBACK_POSTING_LIMITS.attributionCandidates);
  const candidatesOmittedN = Math.max(0, linked.length - printed.length);
  const countsReconcile = counts.outsideFamilyN + counts.unattributableN + counts.outOfPeriodN
    + counts.notFigureMovingN + counts.candidatesN === counts.windowEventsN
    && counts.candidatesN === counts.linkedN + counts.unlinkedN + counts.unresolvedN;

  const verdict = counts.linkedN > 0 ? 'attributed' : 'no-candidates';
  const detailParts = [];
  if (counts.unlinkedN) detailParts.push(`${counts.unlinkedN} further in-window act(s) of a figure-moving family could not be tied to an account this posting froze, and are counted rather than listed.`);
  if (counts.unresolvedN) detailParts.push(`${counts.unresolvedN} in-window act(s) name a record that is gone; they are counted, and no account is guessed for them.`);
  if (counts.unorderedN) detailParts.push(`${counts.unorderedN} act(s) are logged at the SAME instant as the posting, so the record cannot order them before or after it.`);
  if (counts.outOfPeriodN) detailParts.push(`${counts.outOfPeriodN} in-window act(s) touch days outside this posting’s period and are excluded.`);
  if (counts.notFigureMovingN) detailParts.push(`${counts.notFigureMovingN} in-window act(s) cannot move a figure (a price withdrawn or declined before it was ever agreed) and are excluded.`);
  if (counts.unattributableN) detailParts.push(`${counts.unattributableN} in-window act(s) were logged with no record id to join on.`);

  return shape(verdict, {
    window,
    coverage: { ...coverage, earliestEventOn: coverage.earliestEventAt ? dayKey(new Date(coverage.earliestEventAt)) : null },
    candidates: printed,
    candidatesOmittedN,
    movedAccountsN: movedByAccount.size,
    counts,
    countsReconcile,
    detail: detailParts.length ? detailParts.join(' ') : null,
  });
}

/* ---------------------------------------------------------------- the brief */

/**
 * The identity-free attribution line for the brief: counts only, and the
 * sentence that keeps a candidate from reading as a cause.
 */
export function driftAttributionBriefLine(board) {
  const a = board.attributions;
  const parts = [
    `Drift attribution: ${a.attributed} drifted posting(s) with a record-linked candidate act, ${a['no-candidates']} with none, ${a.refused} REFUSED because the event log cannot cover the window.`,
    `${board.attributionCandidatesN} candidate act(s) tied to a frozen account, ${board.attributionUnlinkedN} in-window act(s) that could not be tied, ${board.attributionUnresolvedN} naming a record that is gone.`,
    'A candidate is an act the record cannot exclude, never a proven cause; where the log cannot see back to the posting the join is refused rather than reported as empty.',
  ];
  return parts.join('\n');
}
