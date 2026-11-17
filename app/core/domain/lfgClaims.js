/**
 * app/core/domain/lfgClaims.js — the ONE reader of the Claim, Limitation &
 * Settlement-Authority Register (ADR-0248, Schema v202, `#/claims`).
 *
 * Every state, deadline, day count, suspension contribution, computed authority
 * ceiling, settlement gap and total this module prints is derived here, on read,
 * from stored declarations and the injected clock. Nothing derived is stored
 * anywhere, so the same workspace read twice gives the same answer and a hand-edited
 * file cannot carry a green "in time" over an accrual date it disagrees with.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER MATTER: *at this instant, what does the
 * record prove about the clock running against us, and who was authorised to end it?*
 * The clock answer is one of nine states, and each is a DIFFERENT fact:
 *
 *   merged                   the matter was merged into another live matter; its
 *                            clock passed there.
 *   resolved                 a resolution is recorded, so the clock stopped by an act.
 *   settled-beyond-authority the matter resolved for more than the reporting graph
 *                            computes as authorised above its responsible lines. The
 *                            settlement is REAL and kept; the gap is printed.
 *   clock-unprovable         the accrual day or its declared basis cannot be read, so
 *                            NO deadline is derivable. No day count is printed.
 *   time-barred              the proved deadline passed with no resolution recorded.
 *   critical                 inside the narrowest warning band.
 *   urgent                   inside half the declared horizon.
 *   approaching              inside the declared horizon.
 *   in-time                  outside the declared horizon.
 *
 * WHY `time-barred` DOES NOT SAY "WE HAVE LOST THE CLAIM". The record proves the
 * deadline passed with nothing on file. It holds no court feed, no filing
 * acknowledgement and no docket, so it cannot say whether proceedings were issued
 * before that day. The reader prints the exact days it ran over and says plainly what
 * it cannot prove; a record gap is never upgraded into an allegation. This is the same
 * refusal the statutory-authorisations register makes about a lapsed licence.
 *
 * WHY THE DEADLINE IS DERIVED FROM ACCRUAL AND NOT FROM THE INCIDENT. Limitation runs
 * from accrual — the breach, the act, the termination date, or the date of knowledge.
 * Those are different days. The matter record therefore carries an accrual row with
 * the DAY and the RULE it relied on, and a knowledge-based claim type must carry the
 * knowledge day as well. Where the rule cannot be read the reader refuses a deadline
 * rather than falling back on the incident date, because that fallback is a missed
 * deadline carrying a green tick.
 *
 * WHY A STAY IS PROVED RATHER THAN ASSUMED. A suspension moves the clock only when the
 * evidence its own kind requires is on the record. A proved stay contributes its exact
 * whole days to the deadline. An alleged stay contributes ZERO and the row prints what
 * is missing — deleting the allegation would erase the belief while leaving the
 * deadline that belief moved.
 *
 * WHY THE AUTHORITY CEILING IS COMPUTED FROM THE GRAPH. A settlement ceiling is not a
 * number somebody types on a matter; it is the authority the organisation actually
 * delegated. The reader derives the joint apex above every active line holding every
 * responsible hand, resolves the declared authority grant held by that apex and the
 * grants held on the lines below it, and prints the ceiling that the LOWEST common
 * authority supports. A settlement above it is kept and flagged — the money was really
 * paid — and the exact gap is printed. Picking one hand as "owner of the matter" would
 * silently decide which line's authority applied, which is exactly what the matrix
 * mandate forbids.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A matter names one to four responsible hands.
 * The reader resolves every ACTIVE line that holds each of them through the ONE matrix
 * engine, prints each hand's line position, counts a person ONCE, and exposes the
 * joint apex over every manager of every holder. Where a hand is off the graph the row
 * is printed as an orphan rather than dropped, because deleting it would erase a live
 * claim from the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  LFG_CLAIM_TYPE_BY_KEY,
  LFG_CONCESSION_KIND_BY_KEY,
  LFG_ENGINE_VERSION,
  LFG_RESOLUTION_KIND_BY_KEY,
  LFG_STATE_BY_KEY,
  LFG_STATE_KEYS,
  LFG_STAY_STATE_BY_KEY,
  LFG_STAY_STATE_KEYS,
} from './lfgRegistry.js';
import {
  normalizeLfgAccruals,
  normalizeLfgAuthorityGrants,
  normalizeLfgConcessions,
  normalizeLfgMarkers,
  normalizeLfgMatters,
  normalizeLfgResolutions,
  normalizeLfgSettings,
  normalizeLfgStays,
} from './lfgSchema.js';
import { daysOver, daysRemaining, instantMs, limitationDeadline, sumMinor, utcDayMs } from './lfgMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function lfgPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 * Read from the ONE matrix engine, so this register cannot drift from every other
 * roll-up in the workspace.
 */
export function lfgActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/**
 * The ceiling a seat may settle to, from the grants it holds. Where a person holds
 * more than one grant the LARGEST declared ceiling applies to that person only — a
 * grant is authority given, and two grants do not add up.
 *
 * Returns `{ ceilingMinor, currency, holders, mixedCurrency }`. A mixed-currency set
 * of grants yields NO ceiling and sets `mixedCurrency`, because adding or comparing
 * different currencies would require an exchange rate the record does not hold.
 */
export function ceilingForPersons(grants, personIds, currency) {
  const mine = list(grants).filter((grant) => personIds.includes(grant.personId));
  const currencies = new Set(mine.map((grant) => grant.currency));
  if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(currency))) {
    return { ceilingMinor: null, currency: null, holders: [], mixedCurrency: true };
  }
  if (!mine.length) return { ceilingMinor: null, currency, holders: [], mixedCurrency: false };
  let ceilingMinor = 0;
  const holders = [];
  for (const grant of mine) {
    holders.push(grant.personId);
    if (grant.ceilingMinor > ceilingMinor) ceilingMinor = grant.ceilingMinor;
  }
  return { ceilingMinor, currency, holders, mixedCurrency: false };
}

/**
 * THE CLOCK KERNEL. Pure over (matter, accrual, stays, resolution, nowMs), exported so
 * the suite can pin every branch without a store and so the rule and the screen cannot
 * disagree about a state.
 */
export function deriveLfgClock({ matter, accrual = null, stays = [], resolution = null, nowMs, warningHorizonDays = 90 }) {
  const typeDefinition = matter?.claimType ? LFG_CLAIM_TYPE_BY_KEY[matter.claimType] || null : null;
  const unsupportedType = !typeDefinition;

  const accrualMs = accrual ? utcDayMs(`${accrual.accrualDay}T00:00:00.000Z`) : null;
  const knowledgeMs = accrual && accrual.knowledgeDay ? utcDayMs(`${accrual.knowledgeDay}T00:00:00.000Z`) : null;
  const periodMonths = accrual && Number.isInteger(accrual.periodMonths) ? accrual.periodMonths : null;

  /**
   * THE CLOCK RUNS FROM THE LATER OF THE DAMAGE AND THE DATE OF KNOWLEDGE.
   *
   * For a knowledge-based claim the cause of action accrues when the claimant first
   * knew, or ought reasonably to have known, the facts that make the claim arguable —
   * and that can never precede the damage that founds it. So the clock origin is the
   * LATER of the two days the record actually carries, computed here rather than
   * assumed. Using the damage date alone would place every knowledge-based deadline
   * years early, and using the knowledge date alone would let a matter that was
   * knowable on day one print an artificially distant deadline. Both are the same class
   * of error: a deadline nobody can defend.
   *
   * Both days are printed apart on the screen, so a reader can see which one the
   * arithmetic ran from and why.
   */
  const clockOriginMs = (Number.isFinite(accrualMs) && Number.isFinite(knowledgeMs))
    ? Math.max(accrualMs, knowledgeMs)
    : (Number.isFinite(accrualMs) ? accrualMs : null);
  const originIsKnowledge = Number.isFinite(accrualMs) && Number.isFinite(knowledgeMs) && knowledgeMs > accrualMs;

  const provedStays = list(stays).filter((row) => row?.proved);
  const allegedStays = list(stays).filter((row) => row && !row.proved);
  const staySpans = provedStays.map((row) => ({
    fromMs: utcDayMs(`${row.fromDay}T00:00:00.000Z`),
    toMs: utcDayMs(`${row.toDay}T00:00:00.000Z`),
  }));

  // THE CLOCK IS UNPROVABLE WITHOUT AN ACCRUAL DAY AND A DECLARED PERIOD. There is no
  // fallback: falling back on the opening date or the incident date is precisely the
  // plausible default that turns a missed deadline into a green tick.
  const clock = Number.isFinite(clockOriginMs) && Number.isInteger(periodMonths)
    ? limitationDeadline({ accrualMs: clockOriginMs, periodMonths, stays: staySpans })
    : null;

  const deadlineMs = clock ? clock.deadlineMs : null;
  const remaining = Number.isFinite(deadlineMs) ? daysRemaining(nowMs, deadlineMs) : null;
  const overdue = Number.isFinite(deadlineMs) ? daysOver(nowMs, deadlineMs) : null;

  const horizon = Number.isInteger(warningHorizonDays) ? warningHorizonDays : 90;
  const urgentBand = Math.max(1, Math.floor(horizon / 2));
  const criticalBand = Math.max(1, Math.floor(horizon / 6));

  const resolved = Boolean(resolution);
  const merged = Boolean(resolution && resolution.kind === 'merged');

  const stateFor = (key) => ({ key, ...LFG_STATE_BY_KEY[key] });
  let state;
  if (merged) state = stateFor('merged');
  else if (resolved) state = stateFor('resolved');
  else if (!clock) state = stateFor('clock-unprovable');
  else if (Number.isFinite(remaining) && remaining < 0) state = stateFor('time-barred');
  else if (Number.isFinite(remaining) && remaining <= criticalBand) state = stateFor('critical');
  else if (Number.isFinite(remaining) && remaining <= urgentBand) state = stateFor('urgent');
  else if (Number.isFinite(remaining) && remaining <= horizon) state = stateFor('approaching');
  else state = stateFor('in-time');

  return {
    typeDefinition,
    unsupportedType,
    accrual,
    accrualMs,
    knowledgeMs,
    clockOriginMs,
    clockOriginDay: Number.isFinite(clockOriginMs) ? new Date(clockOriginMs).toISOString().slice(0, 10) : null,
    originIsKnowledge,
    periodMonths,
    baseDeadlineMs: clock ? clock.baseDeadlineMs : null,
    deadlineMs,
    suspendedDays: clock ? clock.suspendedDays : null,
    mergedSpans: clock ? clock.mergedSpans : [],
    daysRemaining: Number.isFinite(remaining) ? remaining : null,
    daysOver: Number.isFinite(overdue) ? overdue : null,
    warningHorizonDays: horizon,
    urgentBand,
    criticalBand,
    provedStays,
    allegedStays,
    resolution,
    state,
    clockProvable: Boolean(clock),
  };
}

/**
 * THE SETTLEMENT KERNEL. Pure over (matter, concessions, resolution, grants, apex), so
 * the authority ceiling and the settlement gap are computed in exactly one place.
 *
 * THE CEILING. The seat whose authority is required is the JOINT APEX above every
 * active line holding every responsible hand. Its ceiling is the largest grant it
 * holds. Where the apex holds no grant, the ceiling is null — NOBODY was authorised,
 * and the register prints that rather than assuming a default.
 *
 * THE GAP. A settlement or judgment amount above the ceiling is the gap. It is
 * recorded, never refused after the fact, because the money was actually paid.
 */
export function deriveLfgSettlement({ matter, resolution = null, concessions = [], apexId = null, apexName = null, grants = [], currency }) {
  const mine = list(concessions);
  const moveMoney = (kind) => Boolean(LFG_CONCESSION_KIND_BY_KEY[kind]?.movesMoney);
  const pick = (kind) => mine.filter((row) => row.kind === kind);

  const currencyRows = mine.filter((row) => row.currency && row.currency !== currency);
  const comparable = mine.filter((row) => !row.currency || row.currency === currency);

  const reserveTotalMinor = sumMinor(comparable, (row) => (row.kind === 'reserve-set' ? row.amountMinor : row.kind === 'reserve-released' ? -row.amountMinor : 0));
  const paidTotalMinor = sumMinor(comparable, (row) => (row.kind === 'payments-on-account' ? row.amountMinor : 0));
  const costsTotalMinor = sumMinor(comparable, (row) => (row.kind === 'costs-award' ? row.amountMinor : 0));
  const interestTotalMinor = sumMinor(comparable, (row) => (row.kind === 'interest' ? row.amountMinor : 0));
  const offerMadeTotalMinor = sumMinor(comparable, (row) => (row.kind === 'offer-made' ? row.amountMinor : 0));
  const offerReceivedTotalMinor = sumMinor(comparable, (row) => (row.kind === 'offer-received' ? row.amountMinor : 0));

  const claimedMinor = Number.isInteger(matter?.claimedMinor) ? matter.claimedMinor : null;
  const resolutionMinor = resolution && Number.isInteger(resolution.amountMinor) ? resolution.amountMinor : null;
  // Total exposure the record can prove: the resolution amount where one is recorded
  // (a judgment or settlement is the real liability), otherwise the sum claimed. Both
  // are named on the screen; this is the figure the register ranks matters by.
  const exposureMinor = resolutionMinor !== null ? resolutionMinor : claimedMinor;

  const apexGrants = list(grants).filter((grant) => apexId && grant.personId === apexId);
  const apexCurrencies = new Set(apexGrants.map((grant) => grant.currency));
  const ceilingResolvable = apexGrants.length > 0 && apexCurrencies.size === 1 && apexCurrencies.has(currency);
  const ceilingMinor = ceilingResolvable ? Math.max(...apexGrants.map((grant) => grant.ceilingMinor)) : null;

  const beyondAuthorityMinor = ceilingMinor !== null && Number.isInteger(resolutionMinor) && resolutionMinor > ceilingMinor
    ? resolutionMinor - ceilingMinor
    : (Number.isInteger(resolutionMinor) && ceilingMinor === null ? resolutionMinor : 0);

  return {
    concessions: mine,
    currencyRows,
    reserveTotalMinor,
    paidTotalMinor,
    costsTotalMinor,
    interestTotalMinor,
    offerMadeTotalMinor,
    offerReceivedTotalMinor,
    offerRows: [...pick('offer-made'), ...pick('offer-received')].sort((a, b) => String(a.atDay).localeCompare(String(b.atDay))),
    claimedMinor,
    resolutionMinor,
    exposureMinor,
    apexId,
    apexName,
    apexGrants,
    ceilingMinor,
    ceilingResolvable,
    mixedCurrency: apexCurrencies.size > 1,
    beyondAuthorityMinor,
    settlementTotalMinor: Number.isInteger(resolutionMinor) ? resolutionMinor + paidTotalMinor + interestTotalMinor + costsTotalMinor : null,
  };
}

/**
 * THE READER. Builds the whole register from stored declarations and the injected
 * clock. Every count it prints is recomputed here; nothing is cached.
 */
export function buildClaims(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeLfgSettings(cfg);

  const matters = normalizeLfgMatters(state?.lfgMatters, warnings);
  const accruals = normalizeLfgAccruals(state?.lfgAccruals, matters, warnings);
  const stays = normalizeLfgStays(state?.lfgStays, matters, warnings);
  const resolutions = normalizeLfgResolutions(state?.lfgResolutions, matters, warnings);
  const concessions = normalizeLfgConcessions(state?.lfgConcessions, matters, warnings);
  const grants = normalizeLfgAuthorityGrants(state?.lfgAuthorityGrants, warnings);
  const markers = normalizeLfgMarkers(state?.lfgMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  const accrualByMatter = new Map(accruals.map((row) => [row.matterId, row]));
  const resolutionByMatter = new Map(resolutions.map((row) => [row.matterId, row]));
  const staysByMatter = new Map();
  for (const row of stays) {
    const held = staysByMatter.get(row.matterId) || [];
    held.push(row);
    staysByMatter.set(row.matterId, held);
  }
  const concessionsByMatter = new Map();
  for (const row of concessions) {
    const held = concessionsByMatter.get(row.matterId) || [];
    held.push(row);
    concessionsByMatter.set(row.matterId, held);
  }
  const mattersById = new Map(matters.map((row) => [row.id, row]));

  /* ---------------------------------------------------------------------- rows */

  const rows = [];
  let orphanHolderN = 0;
  let orphanMatterN = 0;
  for (const matter of matters) {
    const holderRows = matter.responsibleIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? lfgActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? lfgPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: lfgPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;
    const orphan = holderRows.every((row) => !row.onGraph);
    if (orphan) orphanMatterN += 1;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
    // THE JOINT APEX IS THE SEAT WHOSE AUTHORITY IS REQUIRED. Where the engine reports
    // several apex ids the record is genuinely ambiguous, and the reader names the
    // ambiguity rather than choosing one. Where there is exactly one, that is the seat.
    const apexIds = list(apex?.apexIds).filter(Boolean);
    const apexId = apexIds.length === 1 ? apexIds[0] : null;
    const apexName = apexId ? lfgPersonLabel(matrix, apexId) : null;

    const mineConcessions = concessionsByMatter.get(matter.id) || [];
    const clock = deriveLfgClock({
      matter,
      accrual: accrualByMatter.get(matter.id) || null,
      stays: staysByMatter.get(matter.id) || [],
      resolution: resolutionByMatter.get(matter.id) || null,
      nowMs,
      warningHorizonDays: conventions.lfgWarningHorizonDays,
    });
    const settlement = deriveLfgSettlement({
      matter,
      resolution: clock.resolution,
      concessions: mineConcessions,
      apexId,
      apexName,
      grants,
      currency: matter.currency,
    });

    // The single state. `settled-beyond-authority` outranks `resolved` because it is
    // the same fact plus the governance gap, and the gap is the reason to read the row.
    let state = clock.state;
    if (state.key === 'resolved' && settlement.beyondAuthorityMinor > 0) {
      state = { key: 'settled-beyond-authority', ...LFG_STATE_BY_KEY['settled-beyond-authority'] };
    }

    rows.push({
      matter,
      holderRows,
      orphan,
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: lfgPersonLabel(matrix, managerId) })),
      apex,
      apexIds,
      apexId,
      apexName,
      apexAmbiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      baseDeadlineDay: clock.baseDeadlineMs ? new Date(clock.baseDeadlineMs).toISOString().slice(0, 10) : null,
      deadlineDay: clock.deadlineMs ? new Date(clock.deadlineMs).toISOString().slice(0, 10) : null,
      ...clock,
      ...settlement,
      state,
    });
  }
  rows.sort((a, b) => {
    // Order by urgency of the clock first, then exposure, then reference. A register
    // sorted alphabetically buries the claim that runs out tomorrow.
    const urgency = [LFG_STATE_KEYS.indexOf(a.state.key), LFG_STATE_KEYS.indexOf(b.state.key)];
    if (urgency[0] !== urgency[1]) return urgency[0] - urgency[1];
    const exposureDiff = (b.exposureMinor || 0) - (a.exposureMinor || 0);
    if (exposureDiff !== 0) return exposureDiff;
    return String(a.matter.matterRef).localeCompare(String(b.matter.matterRef));
  });

  /* -------------------------------------------------------------------- totals */

  const states = Object.fromEntries(LFG_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const stayStates = Object.fromEntries(LFG_STAY_STATE_KEYS.map((key) => [key, 0]));
  for (const stay of stays) {
    const key = stay.proved ? 'proved' : 'alleged';
    stayStates[key] = (stayStates[key] || 0) + 1;
  }
  const stayEndedN = stays.filter((row) => row.proved && utcDayMs(`${row.toDay}T00:00:00.000Z`) < utcDayMs(nowMs)).length;

  const openRows = rows.filter((row) => !['resolved', 'settled-beyond-authority', 'merged'].includes(row.state.key));
  const daysRemainingValues = rows.map((row) => row.daysRemaining).filter((value) => Number.isInteger(value) && value >= 0);
  const daysOverValues = rows.map((row) => row.daysOver).filter((value) => Number.isInteger(value) && value > 0);

  const currency = rows.length ? rows[0].matter.currency : null;
  const mixedCurrencyN = rows.filter((row) => currency && row.matter.currency !== currency).length;

  const totals = {
    matters: rows.length,
    open: openRows.length,
    inTime: states['in-time'] || 0,
    approaching: states.approaching || 0,
    urgent: states.urgent || 0,
    critical: states.critical || 0,
    timeBarred: states['time-barred'] || 0,
    clockUnprovable: states['clock-unprovable'] || 0,
    resolved: (states.resolved || 0) + (states['settled-beyond-authority'] || 0),
    settled: rows.filter((row) => row.resolution && row.resolution.kind === 'settled').length,
    settledBeyondAuthority: states['settled-beyond-authority'] || 0,
    merged: states.merged || 0,
    stays: stays.length,
    staysProved: stayStates.proved || 0,
    staysAlleged: stayStates.alleged || 0,
    staysEnded: stayEndedN,
    holders: new Set(rows.flatMap((row) => row.matter.responsibleIds)).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
    daysRemainingMin: daysRemainingValues.length ? Math.min(...daysRemainingValues) : null,
    daysOverTotal: daysOverValues.reduce((sum, value) => sum + value, 0),
    // Money totals are summed only over rows in the register's declared currency when
    // every row shares it. A mixed-currency register prints NO total and says so,
    // because adding across currencies needs a rate this record does not hold.
    claimedTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.claimedMinor),
    reserveTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.reserveTotalMinor),
    paidTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.paidTotalMinor),
    costsTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.costsTotalMinor),
    ceilingTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.ceilingMinor),
    beyondAuthorityTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.beyondAuthorityMinor),
    concessionRows: concessions.length,
    currencies: [...new Set(rows.map((row) => row.matter.currency))].sort(),
    currency,
    mixedCurrencyN,
  };

  /* ------------------------------------------------------------- reconciliation */

  const matterIds = new Set(matters.map((row) => row.id));
  const balances = {
    // The FIRST claim: the printed state counts re-add to the matters they summarise.
    statesReconcile: Object.values(states).reduce((sum, value) => sum + value, 0) === rows.length,
    // The SECOND claim, held apart: every child row ties to a matter on the record.
    accrualsReconcile: accruals.every((row) => matterIds.has(row.matterId)),
    staysReconcile: stays.every((row) => matterIds.has(row.matterId)),
    resolutionsReconcile: resolutions.every((row) => matterIds.has(row.matterId)),
    concessionsReconcile: concessions.every((row) => matterIds.has(row.matterId)),
    // A matter with two accruals, or a concession whose amount could not be read,
    // would make a printed total a total of something other than its rows.
    oneAccrualPerMatter: accruals.length === new Set(accruals.map((row) => row.matterId)).size,
    oneResolutionPerMatter: resolutions.length === new Set(resolutions.map((row) => row.matterId)).size,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} responsible hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the matters they summarise.');
  if (!balances.accrualsReconcile || !balances.staysReconcile || !balances.resolutionsReconcile || !balances.concessionsReconcile) {
    incompleteReasons.push('A child row does not tie to a matter on the record.');
  }
  if (!balances.oneAccrualPerMatter) incompleteReasons.push('A matter carries more than one accrual, so its deadline is ambiguous.');
  if (!balances.oneResolutionPerMatter) incompleteReasons.push('A matter carries more than one resolution.');
  if (mixedCurrencyN) incompleteReasons.push(`${mixedCurrencyN} matter(s) are declared in a currency other than the register's first, so no cross-currency money total is printed.`);
  const unresolvableCeilings = rows.filter((row) => row.currencyRows.length > 0);
  if (unresolvableCeilings.length) incompleteReasons.push(`${unresolvableCeilings.length} matter(s) carry a concession in another currency; those rows are excluded from the money totals and counted here.`);

  /* ----------------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.managerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: lfgPersonLabel(matrix, managerId),
        mattersN: 0,
        openN: 0,
        urgentN: 0,
        timeBarredN: 0,
        unprovableN: 0,
        exposureMinor: 0,
        holders: new Set(),
        matterIds: new Set(),
      };
      if (!entry.matterIds.has(row.matter.id)) {
        entry.matterIds.add(row.matter.id);
        entry.mattersN += 1;
        if (['approaching', 'urgent', 'critical'].includes(row.state.key)) entry.openN += 1;
        if (['urgent', 'critical'].includes(row.state.key)) entry.urgentN += 1;
        if (row.state.key === 'time-barred') entry.timeBarredN += 1;
        if (row.state.key === 'clock-unprovable') entry.unprovableN += 1;
        if (Number.isInteger(row.exposureMinor)) entry.exposureMinor += row.exposureMinor;
      }
      for (const holder of row.holderRows) {
        if (holder.lines.some((line) => line.managerId === managerId)) entry.holders.add(holder.personId);
      }
      byLine.set(managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, holdersN: entry.holders.size, holders: [...entry.holders].sort() }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* ------------------------------------------------------------------ disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Responsible hands are withheld above rank 3; the party, the claim type, the forum, the matter reference and the amounts are organisational facts and stay printed. Which named individual is answerable for a particular claim is individual material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  const attention = {
    urgentN: (states.urgent || 0) + (states.critical || 0),
    timeBarredN: states['time-barred'] || 0,
    unprovableN: states['clock-unprovable'] || 0,
    settledBeyondAuthorityN: states['settled-beyond-authority'] || 0,
    total: (states.urgent || 0) + (states.critical || 0) + (states['time-barred'] || 0) + (states['clock-unprovable'] || 0) + (states['settled-beyond-authority'] || 0),
  };

  return {
    ok: true,
    engineVersion: LFG_ENGINE_VERSION,
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    matters,
    accruals,
    stays,
    resolutions,
    concessions,
    grants,
    markers,
    mattersById,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanHolderN,
    orphanMatterN,
    states,
    stateTotal: Object.values(states).reduce((sum, value) => sum + value, 0),
    stayStates,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    lineRows,
    stateRows: LFG_STATE_KEYS.map((key) => ({ key, label: LFG_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    stayStateRows: LFG_STAY_STATE_KEYS.map((key) => ({ key, label: LFG_STAY_STATE_BY_KEY[key].label, count: stayStates[key] || 0 })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a matter urgent or
 * critical on its clock, past its proved deadline, with an unprovable clock, or
 * settled beyond computed authority — and never every matter on the register, so the
 * badge reads as "work owed now" rather than "how many claims we have".
 */
export function claimAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildClaims(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person, a line or a fee earner.
 */
export function claimSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildClaims(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Claims & limitation', route: '#/claims', ...signal });
  const t = report.totals;

  if (t.timeBarred) {
    add({
      ruleId: 'LFG-01',
      severity: 5,
      confidence: 'high',
      title: `${t.timeBarred} claim(s) past their proved limitation deadline with no resolution recorded`,
      detail: `Their proved deadlines passed ${t.daysOverTotal} whole day(s) over in total. The register derives the deadline from the declared accrual, the declared period and every PROVED suspension — and it holds no court feed, so it cannot say whether proceedings were issued before that day. A record gap is not an allegation that the claim was lost.`,
      action: { label: 'Open the claims register', route: '#/claims' },
      evidence: [
        `${t.matters} matter(s) on the register`,
        `${t.holders} responsible hand(s) across ${t.linesN} reporting line(s)`,
      ],
    });
  }

  if (t.urgentN) {
    add({
      ruleId: 'LFG-02',
      severity: 5,
      confidence: 'high',
      title: `${t.urgentN} claim(s) inside the urgent or critical warning band`,
      detail: `Their proved deadlines sit inside half the declared warning horizon, or the narrowest band. ${t.staysAlleged} recorded suspension(s) across the register are merely ALLEGED — they move no deadline, and each prints what evidence its own kind requires.`,
      action: { label: 'Open the limitation clocks', route: '#/claims?view=clocks' },
      evidence: [`${t.approaching} further matter(s) inside the horizon`, `${conventionsLabel(report)}`],
    });
  }

  if (t.clockUnprovable) {
    add({
      ruleId: 'LFG-03',
      severity: 5,
      confidence: 'high',
      title: `${t.clockUnprovable} claim(s) with an unprovable limitation clock`,
      detail: 'The accrual day or the written basis for it cannot be read, so NO deadline is derivable and the register prints no day count. It refuses to fall back on the opening date or the incident date, because that fallback is how a deadline is missed with a green tick on it.',
      action: { label: 'Record the accrual basis', route: '#/claims' },
      evidence: [`${t.matters} matter(s) on the register`],
    });
  }

  if (t.settledBeyondAuthority) {
    add({
      ruleId: 'LFG-04',
      severity: 5,
      confidence: 'high',
      title: `${t.settledBeyondAuthority} matter(s) settled or determined beyond the computed settlement authority`,
      detail: `The amounts paid exceed the authority the reporting graph computes above the responsible lines by ${t.beyondAuthorityTotalMinor === null ? 'an amount the register cannot total across currencies' : `${t.beyondAuthorityTotalMinor} minor units`}. The settlements are real and are kept — the money was actually paid — and the gap between the number paid and the number anyone was authorised to pay is printed as the governance fact it is.`,
      action: { label: 'Open the settlement authority', route: '#/claims?view=settlements' },
      evidence: [`${t.settled} settlement(s) recorded`, `${t.reserveTotalMinor === null ? 'reserve total withheld' : `${t.reserveTotalMinor} minor units reserved`}`],
    });
  }

  if (t.staysAlleged) {
    add({
      ruleId: 'LFG-05',
      severity: 4,
      confidence: 'high',
      title: `${t.staysAlleged} suspension(s) of the limitation clock are alleged but not proved`,
      detail: 'Each is kept on the record and moves NO deadline until the evidence its own kind requires is present: a standstill needs both parties named as signatories, a conciliation certificate needs its reference and issue day, a court order needs the day it was made. Deleting an allegation would erase the belief while leaving the deadline it moved.',
      action: { label: 'Open the clock detail', route: '#/claims?view=clocks' },
      evidence: [`${t.staysProved} suspension(s) proved and counted`, `${t.stays} recorded in total`],
    });
  }

  return signals;
}

function conventionsLabel(report) {
  return `declared warning horizon ${report.conventions.lfgWarningHorizonDays} day(s)`;
}
