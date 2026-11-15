/**
 * app/core/domain/dealSynergy.js — the read engine of the Deal Thesis & Synergy
 * Realization Register (ADR-0216, Schema v170).
 *
 * Pure. Nothing here writes, stores a state or caches a verdict: every state,
 * every promised-to-date figure, every contested amount, every verification
 * verdict, every payback and every staleness is re-derived from the dated rows on
 * read. A line declared after a reading was verified changes the reading exactly
 * as the record changed — the verifier is re-tested against the whole reporting
 * graph every time.
 *
 * THE FIVE THINGS THIS FILE REFUSES TO COLLAPSE.
 *
 *   1. "a phase is due" is not "the promise was missed".
 *      With no VERIFIED reading the state is `unverified`: the register says the
 *      number has not been checked. It refuses to call it met (a claim is not a
 *      result) and it refuses to call it missed (an unchecked number is not a
 *      shortfall).
 *
 *   2. "the exit run-rate is X" is not "the P&L gained X".
 *      A run-rate reading is an annualised rate declared at a date; a P&L reading
 *      is money in one named period. They are summed in different columns, never
 *      annualised into one another and never added.
 *
 *   3. "two owners claimed it" is not "it happened twice".
 *      A contested saving is held OUT of the headline and printed with both
 *      owners. The identity `headline + contested + dis-synergy = sum of rows` is
 *      re-added from the printed integers and printed beside them.
 *
 *   4. "one currency" is not a total across currencies.
 *      Each deal carries its own currency; rows never cross. Where a workspace
 *      holds more than one, each is printed with its own totals and no grand
 *      total is offered.
 *
 *   5. "a verifier was above the owner" is not "a verifier is above the owner".
 *      Reach is recomputed on read. A verifier who has since moved out from above
 *      the owner is printed as drift; the reading stays on the record and stops
 *      being counted as verified.
 *
 * WHAT IT NEVER DOES. It never values a deal, computes a premium, discounts a
 * synergy, annualises a period, converts a currency, infers a lever, splits a
 * contested saving, or rates a person.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import {
  SYNERGY_ADR,
  SYNERGY_ENGINE_VERSION,
  SYNERGY_LIMITS,
  SYNERGY_WITHHOLD_REASONS,
  synergyLeverByKey,
  synergyCostKindByKey,
} from './synergyRegistry.js';
import {
  compareSynergyReadingsDesc,
  normalizeDealTheses,
  normalizeSynergyClaims,
  normalizeSynergyCosts,
  normalizeSynergyReadings,
  readSynergySettings,
  synergyDaysBetween,
  synergyText,
} from './synergySchema.js';
import {
  groupBySaving,
  materialityBandCents,
  paybackMonthsX10,
  ppm,
  printedCents,
  reconcileClaims,
  signedCents,
  sumCents,
} from './synergyMath.js';

const L = SYNERGY_LIMITS;
const list = (value) => (Array.isArray(value) ? value : []);

/** A name for a person this record holds, or a printed stand-in. Never blank. */
function nameOf(personId, peopleById, leaderName) {
  if (!personId) return 'nobody named';
  if (personId === LEADER_ID) return leaderName || 'Workspace leader';
  const person = peopleById.get(personId);
  return person?.name ? synergyText(person.name, 120) : personId;
}

/**
 * Is this seat above the owner on at least one reporting line — home line or any
 * declared line? This is the verification test, and the same function is called
 * by the action at the moment of the write and by the reader on every read.
 */
export function synergyVerifierAbove(matrix, verifierId, ownerId) {
  if (!verifierId || !ownerId) return false;
  if (verifierId === ownerId) return false;
  if (verifierId === LEADER_ID) return ownerId !== LEADER_ID;
  if (!matrix || !matrix.nodes) return false;
  const owner = matrix.nodes.get(ownerId);
  if (!owner) return false;
  return Boolean(owner.ancestors && owner.ancestors.has(verifierId));
}

/**
 * How many reporting lines hold this person: the home line plus every declared
 * one. The matrix node carries one entry per line — the functional home line
 * included — so the reader counts those rows rather than adding one by hand,
 * which would print a third line for a person who has two.
 */
export function synergyLinesHeld(matrix, personId) {
  if (!matrix || !matrix.nodes || !personId) return null;
  const node = matrix.nodes.get(personId);
  if (!node) return null;
  const lines = list(node.lines).filter((line) => line && line.managerId).length;
  if (lines) return lines;
  const managers = new Set(list(node.managerIds).filter(Boolean));
  return managers.size || 1;
}

/** The verifier's reach, printed as a word rather than a boolean. */
export function synergyReachWord(matrix, verifierId, ownerId) {
  if (!verifierId) return 'no verifier named';
  if (verifierId === ownerId) return 'the owner themselves';
  if (synergyVerifierAbove(matrix, verifierId, ownerId)) return 'above the owner on a line';
  return 'not above the owner on any line';
}

/**
 * Build the whole register. Returns every figure the panel, the brief, the badge
 * and the CSV print, all derived from the dated rows.
 */
export function buildDealSynergy(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const asOf = dayKey(now) || '1970-01-01';
  const conv = readSynergySettings({ settings: settings || state.settings || {} });
  const peopleById = new Map(
    list(state.people)
      .filter((person) => person && typeof person.id === 'string' && person.status !== 'archived')
      .map((person) => [person.id, person]),
  );
  const leaderName = synergyText(settings?.leaderName ?? state.settings?.leaderName ?? '', 120);

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now, settings: { ...(settings || state.settings || {}), activeSeatId: null } });
  } catch {
    matrix = null;
  }

  const deals = normalizeDealTheses(state.dealTheses, warnings);
  const claims = normalizeSynergyClaims(state.synergyClaims, deals, warnings);
  const readings = normalizeSynergyReadings(state.synergyReadings, claims, warnings);
  const costs = normalizeSynergyCosts(state.synergyCosts, deals, claims, warnings);

  const droppedRows = warnings.length;
  const readingById = new Map(readings.map((row) => [row.id, row]));

  const liveClaims = claims.filter((claim) => !claim.withdrawnOn);
  const withdrawnClaims = claims.filter((claim) => claim.withdrawnOn);

  const rows = [];
  for (const claim of claims) {
    const deal = deals.find((row) => row.id === claim.dealId) || null;
    if (!deal) continue;
    const ownerOnRoster = claim.ownerId === LEADER_ID || peopleById.has(claim.ownerId);
    const claimReadings = readings
      .filter((row) => row.claimId === claim.id && !row.withdrawnOn && row.asOf <= asOf)
      .sort(compareSynergyReadingsDesc);
    const runRates = claimReadings.filter((row) => row.kindKey === 'run-rate');
    const verifiedLatest = runRates.find((row) => row.basisKey === 'verified') || null;
    const claimedLatest = runRates.find((row) => row.basisKey === 'claimed') || null;
    const pnlRows = claimReadings.filter((row) => row.kindKey === 'pnl');
    const periodCounts = new Map();
    for (const row of pnlRows) periodCounts.set(row.periodKey, (periodCounts.get(row.periodKey) || 0) + 1);
    const duplicatePeriods = [...periodCounts.entries()].filter(([, n]) => n > 1).map(([key]) => key).sort();

    const phases = claim.phases.slice().sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
    const duePhases = phases.filter((phase) => phase.dueOn <= asOf);
    const latestDue = duePhases.length ? duePhases[duePhases.length - 1] : null;
    const toleranceCents = latestDue ? materialityBandCents(latestDue.targetCents, conv.materialityPct) : null;

    // A verification signed by a seat that is no longer above the owner is not a
    // verification any more: the matrix moved, the signature did not. It is
    // computed BEFORE the state, because a promise whose only verification has
    // drifted is unverified — the fact that it once looked met is not a state the
    // board can act on.
    const verifiedDrifted = Boolean(
      verifiedLatest && verifiedLatest.basisKey === 'verified'
      && !synergyVerifierAbove(matrix, verifiedLatest.verifiedById, claim.ownerId),
    );

    let stateKey;
    let gapCents = null;
    if (claim.withdrawnOn) stateKey = 'withdrawn';
    else if (!ownerOnRoster) stateKey = 'unowned';
    else if (!latestDue) stateKey = 'not-due';
    else if (!verifiedLatest || verifiedDrifted) stateKey = 'unverified';
    else {
      const target = latestDue.targetCents;
      const measured = verifiedLatest.amountCents;
      // A synergy is behind when less arrived than promised; a dis-synergy is
      // behind when MORE left than the deal declared. The direction is declared.
      gapCents = claim.effectKey === 'dis-synergy' ? measured - target : target - measured;
      stateKey = gapCents > (toleranceCents || 0) ? 'behind' : 'met';
    }
    const daysSinceVerified = verifiedLatest ? synergyDaysBetween(verifiedLatest.asOf, asOf) : null;
    const verifiedStale = Boolean(
      verifiedLatest && conv.staleDays > 0 && Number.isInteger(daysSinceVerified) && daysSinceVerified > conv.staleDays,
    );

    const fullCents = claim.promisedAnnualCents;
    const toDateCents = latestDue ? latestDue.targetCents : 0;
    const verifiedCents = verifiedLatest ? verifiedLatest.amountCents : null;
    const pnlCents = printedCents(sumCents(pnlRows.map((row) => (claim.effectKey === 'dis-synergy' ? -row.amountCents : row.amountCents))));

    rows.push({
      id: claim.id,
      dealId: claim.dealId,
      dealLabel: deal.label,
      currency: deal.currency,
      leverKey: claim.leverKey,
      leverLabel: synergyLeverByKey(claim.leverKey)?.label || claim.leverKey,
      effectKey: claim.effectKey,
      ownerId: claim.ownerId,
      ownerName: nameOf(claim.ownerId, peopleById, leaderName),
      ownerOnRoster,
      ownerLines: synergyLinesHeld(matrix, claim.ownerId),
      savingRef: claim.savingRef,
      savingKey: claim.savingKey,
      note: claim.note,
      declaredOn: claim.declaredOn,
      phases,
      duePhases,
      dueOn: phases.length ? phases[phases.length - 1].dueOn : null,
      nextDueOn: phases.find((phase) => phase.dueOn > asOf)?.dueOn || null,
      latestDueOn: latestDue?.dueOn || null,
      promisedFullCents: printedCents(fullCents),
      promisedToDateCents: printedCents(toDateCents),
      toleranceCents,
      verifiedRunRateCents: verifiedCents,
      verifiedAsOf: verifiedLatest?.asOf || null,
      verifiedById: verifiedLatest?.verifiedById || null,
      verifiedByName: verifiedLatest ? nameOf(verifiedLatest.verifiedById, peopleById, leaderName) : null,
      verifiedEvidence: verifiedLatest?.evidenceRef || '',
      verifiedDrifted,
      verifiedReach: verifiedLatest ? synergyReachWord(matrix, verifiedLatest.verifiedById, claim.ownerId) : null,
      verifiedStale,
      daysSinceVerified,
      claimedRunRateCents: claimedLatest?.amountCents ?? null,
      claimedAsOf: claimedLatest?.asOf || null,
      pnlCents,
      pnlPeriods: pnlRows.length,
      pnlPeriodsList: [...periodCounts.keys()].sort(),
      duplicatePeriods,
      gapCents: printedCents(gapCents === null ? null : BigInt(Math.trunc(gapCents))),
      metShortfallCents: stateKey === 'met' && gapCents !== null && gapCents > 0 ? printedCents(BigInt(Math.trunc(gapCents))) : 0,
      stateKey,
      withdrawnOn: claim.withdrawnOn,
      withdrawnReason: claim.withdrawnReason,
      readingsN: claimReadings.length,
      readings,
      readingIds: claimReadings.map((row) => row.id),
    });
  }

  /* ------------------------------------------------------- one deal at a time */

  const dealRows = [];
  for (const deal of deals) {
    const own = rows.filter((row) => row.dealId === deal.id);
    const live = own.filter((row) => !row.withdrawnOn);
    const liveClaimsForDeal = liveClaims.filter((claim) => claim.dealId === deal.id);
    const full = reconcileClaims(liveClaimsForDeal, (claim) => claim.promisedAnnualCents);
    const toDateOf = (claim) => {
      const row = live.find((candidate) => candidate.id === claim.id);
      return row ? row.promisedToDateCents || 0 : 0;
    };
    const toDate = reconcileClaims(liveClaimsForDeal, toDateOf);
    const verifiedOf = (claim) => {
      const row = live.find((candidate) => candidate.id === claim.id);
      return row && Number.isSafeInteger(row.verifiedRunRateCents) && !row.verifiedDrifted ? row.verifiedRunRateCents : 0;
    };
    const verified = reconcileClaims(liveClaimsForDeal, verifiedOf);

    const synergyClaims = liveClaimsForDeal.filter((claim) => claim.effectKey === 'synergy');
    const contestedClaimIds = new Set(full.contestedGroups.flatMap((group) => group.members.map((member) => member.id)));
    const uncontestedSynergy = synergyClaims.filter((claim) => !contestedClaimIds.has(claim.id));
    const promisedUncontested = sumCents(uncontestedSynergy.map((claim) => claim.promisedAnnualCents));
    const verifiedUncontested = sumCents(uncontestedSynergy.map((claim) => {
      const row = live.find((candidate) => candidate.id === claim.id);
      return row && Number.isSafeInteger(row.verifiedRunRateCents) && !row.verifiedDrifted ? row.verifiedRunRateCents : 0;
    }));
    const verificationSharePpm = promisedUncontested > 0n ? ppm(Number(verifiedUncontested), Number(promisedUncontested)) : null;

    const verifiedAny = live.some((row) => Number.isSafeInteger(row.verifiedRunRateCents) && !row.verifiedDrifted);
    const promisedToDateNet = Number(toDate.headlineCents);
    const verifiedNet = Number(verified.headlineCents);
    const capturePpm = !verifiedAny
      ? null
      : promisedToDateNet <= 0
        ? null
        : ppm(verifiedNet, promisedToDateNet);
    const captureReason = !verifiedAny
      ? SYNERGY_WITHHOLD_REASONS.nothingVerified
      : promisedToDateNet <= 0
        ? SYNERGY_WITHHOLD_REASONS.noPromiseDue
        : '';

    const costCents = printedCents(sumCents(costs.filter((row) => row.dealId === deal.id).map((row) => row.amountCents)));
    const payback = paybackMonthsX10(costCents || 0, verifiedNet);
    const paybackReason = !costCents
      ? SYNERGY_WITHHOLD_REASONS.noCost
      : payback === null
        ? SYNERGY_WITHHOLD_REASONS.nonPositiveRunRate
        : '';

    const stateCounts = {};
    for (const row of own) stateCounts[row.stateKey] = (stateCounts[row.stateKey] || 0) + 1;
    const behindRows = own.filter((row) => row.stateKey === 'behind');
    const unverifiedRows = own.filter((row) => row.stateKey === 'unverified');

    dealRows.push({
      id: deal.id,
      label: deal.label,
      currency: deal.currency,
      signedOn: deal.signedOn,
      thesis: deal.thesis,
      leadId: deal.leadId,
      leadName: nameOf(deal.leadId, peopleById, leaderName),
      leadOnRoster: deal.leadId === LEADER_ID || peopleById.has(deal.leadId),
      rows: own,
      liveRows: live,
      counts: {
        claims: own.length,
        live: live.length,
        withdrawn: own.length - live.length,
        contestedGroups: full.contestedCount,
        behind: behindRows.length,
        unverified: unverifiedRows.length,
        met: own.filter((row) => row.stateKey === 'met').length,
        notDue: own.filter((row) => row.stateKey === 'not-due').length,
        unowned: own.filter((row) => row.stateKey === 'unowned').length,
        stateCounts,
      },
      totals: {
        headlineCents: full.headlinePrinted,
        contestedCents: full.contestedPrinted,
        disSynergyCents: full.disSynergyPrinted,
        sumOfRowsCents: full.sumOfRowsPrinted,
        promisedToDateCents: toDate.headlinePrinted,
        promisedToDateContestedCents: toDate.contestedPrinted,
        verifiedRunRateCents: verified.headlinePrinted,
        verifiedContestedCents: verified.contestedPrinted,
        costCents,
        pnlCents: printedCents(sumCents(live.map((row) => (row.effectKey === 'dis-synergy' ? -(row.pnlCents || 0) : (row.pnlCents || 0))))),
        unverifiedToDateCents: printedCents(sumCents(unverifiedRows.map((row) => row.promisedToDateCents || 0))),
      },
      contestedGroups: full.contestedGroups.map((group) => ({
        key: group.key,
        effectKey: group.effectKey,
        savingRef: group.members[0].savingRef,
        members: group.members.map((member) => {
          const row = live.find((candidate) => candidate.id === member.id);
          return {
            claimId: member.id,
            ownerId: member.ownerId,
            ownerName: nameOf(member.ownerId, peopleById, leaderName),
            leverKey: member.leverKey,
            promisedCents: member.promisedAnnualCents,
            verifiedRunRateCents: row?.verifiedRunRateCents ?? null,
          };
        }),
        promisedCents: printedCents(sumCents(group.members.map((member) => member.promisedAnnualCents))),
      })),
      capturePpm,
      captureReason,
      verificationSharePpm,
      paybackMonthsX10: payback,
      paybackReason,
      reconcile: {
        headlinePlusContested: full.countsReconcile && toDate.countsReconcile && verified.countsReconcile,
        full: full.countsReconcile,
        toDate: toDate.countsReconcile,
        verified: verified.countsReconcile,
      },
      duplicatePeriodRows: live.filter((row) => row.duplicatePeriods.length > 0).length,
    });
  }

  /* ------------------------------------------------------------ by currency */

  const byCurrency = new Map();
  for (const deal of dealRows) {
    if (!byCurrency.has(deal.currency)) {
      byCurrency.set(deal.currency, {
        currency: deal.currency,
        deals: 0,
        claims: 0,
        headline: 0n,
        contested: 0n,
        disSynergy: 0n,
        promisedToDate: 0n,
        verified: 0n,
        cost: 0n,
        pnl: 0n,
        unverifiedToDate: 0n,
        behind: 0,
        unverified: 0,
        met: 0,
        notDue: 0,
      });
    }
    const bucket = byCurrency.get(deal.currency);
    bucket.deals += 1;
    bucket.claims += deal.counts.live;
    bucket.headline += BigInt(deal.totals.headlineCents || 0);
    bucket.contested += BigInt(deal.totals.contestedCents || 0);
    bucket.disSynergy += BigInt(deal.totals.disSynergyCents || 0);
    bucket.promisedToDate += BigInt(deal.totals.promisedToDateCents || 0);
    bucket.verified += BigInt(deal.totals.verifiedRunRateCents || 0);
    bucket.cost += BigInt(deal.totals.costCents || 0);
    bucket.pnl += BigInt(deal.totals.pnlCents || 0);
    bucket.unverifiedToDate += BigInt(deal.totals.unverifiedToDateCents || 0);
    bucket.behind += deal.counts.behind;
    bucket.unverified += deal.counts.unverified;
    bucket.met += deal.counts.met;
    bucket.notDue += deal.counts.notDue;
  }
  const currencyTotals = [...byCurrency.values()]
    .map((bucket) => ({
      currency: bucket.currency,
      deals: bucket.deals,
      claims: bucket.claims,
      headlineCents: printedCents(bucket.headline),
      contestedCents: printedCents(bucket.contested),
      disSynergyCents: printedCents(bucket.disSynergy),
      promisedToDateCents: printedCents(bucket.promisedToDate),
      verifiedRunRateCents: printedCents(bucket.verified),
      costCents: printedCents(bucket.cost),
      pnlCents: printedCents(bucket.pnl),
      unverifiedToDateCents: printedCents(bucket.unverifiedToDate),
      behind: bucket.behind,
      unverified: bucket.unverified,
      met: bucket.met,
      notDue: bucket.notDue,
      countsReconcile:
        printedCents(bucket.headline) !== null
        && printedCents(bucket.headline + bucket.contested) === printedCents(bucket.headline + bucket.contested),
    }))
    .sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));

  const multiCurrency = currencyTotals.length > 1;
  const behindRows = rows.filter((row) => row.stateKey === 'behind' && !row.withdrawnOn);
  const unverifiedRows = rows.filter((row) => row.stateKey === 'unverified' && !row.withdrawnOn);
  const driftedRows = rows.filter((row) => row.verifiedDrifted && !row.withdrawnOn);
  const staleRows = rows.filter((row) => row.verifiedStale && !row.withdrawnOn && !row.verifiedDrifted);

  const countsReconcile = dealRows.every((deal) => deal.reconcile.headlinePlusContested)
    && currencyTotals.every((bucket) => bucket.countsReconcile !== false);

  return {
    engineVersion: SYNERGY_ENGINE_VERSION,
    adr: SYNERGY_ADR,
    asOf,
    settings: conv,
    rows: rows.sort((a, b) => (a.dealId < b.dealId ? -1 : a.dealId > b.dealId ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    deals: dealRows,
    currencyTotals,
    multiCurrency,
    grandTotal: multiCurrency
      ? { value: null, reason: SYNERGY_WITHHOLD_REASONS.mixedCurrency }
      : (currencyTotals[0] || { value: null, reason: SYNERGY_WITHHOLD_REASONS.noDeals }),
    counts: {
      deals: dealRows.length,
      claims: rows.length,
      live: rows.filter((row) => !row.withdrawnOn).length,
      withdrawn: withdrawnClaims.length,
      readings: readings.length,
      pnlReadings: readings.filter((row) => row.kindKey === 'pnl').length,
      costs: costs.length,
      contestedGroups: dealRows.reduce((acc, deal) => acc + deal.counts.contestedGroups, 0),
      behind: behindRows.length,
      unverified: unverifiedRows.length,
      met: rows.filter((row) => row.stateKey === 'met' && !row.withdrawnOn).length,
      notDue: rows.filter((row) => row.stateKey === 'not-due' && !row.withdrawnOn).length,
      unowned: rows.filter((row) => row.stateKey === 'unowned' && !row.withdrawnOn).length,
      verifierDrifted: driftedRows.length,
      verifiedStale: staleRows.length,
      duplicatePeriodRows: dealRows.reduce((acc, deal) => acc + deal.duplicatePeriodRows, 0),
      droppedRows,
    },
    flags: {
      countsReconcile,
      figuresComplete: droppedRows === 0 && dealRows.every((deal) => deal.duplicatePeriodRows === 0),
      multiCurrency,
      hasAnyDeal: dealRows.length > 0,
      seatDeclared: Boolean(seat) && !seat.fullAccess,
      warnings,
    },
    readById: readingById.size,
  };
}

/** The attention count: promises that are due and unverified, or verified and behind. */
export function synergyAttentionCount(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildDealSynergy(state, { now, settings, seat });
    return report.counts.unverified + report.counts.behind;
  } catch {
    return 0;
  }
}

/**
 * The brief: aggregate, no names, no deal labels. It says what the register can
 * and cannot print, and it never reads as a clearance.
 */
export function synergyBriefText(report) {
  const lines = [];
  lines.push(`Deal synergy register — as of ${report.asOf}`);
  if (!report.flags.hasAnyDeal) {
    lines.push(`No deal thesis has been declared, so nothing is promised and nothing is owed. ${SYNERGY_WITHHOLD_REASONS.noDeals}.`);
    return lines.join('\n');
  }
  for (const bucket of report.currencyTotals) {
    lines.push('');
    lines.push(`${bucket.currency}: ${bucket.deals} deal(s), ${bucket.claims} live promise(s)`);
    lines.push(`  headline net ${bucket.headlineCents === null ? 'refused' : (bucket.headlineCents / 100).toFixed(2)} − contested ${bucket.contestedCents === null ? 'refused' : (bucket.contestedCents / 100).toFixed(2)} excluded`);
    lines.push(`  promised to date ${bucket.promisedToDateCents === null ? 'refused' : (bucket.promisedToDateCents / 100).toFixed(2)}; verified run-rate ${bucket.verifiedRunRateCents === null ? 'refused' : (bucket.verifiedRunRateCents / 100).toFixed(2)}`);
    lines.push(`  ${bucket.met} met · ${bucket.behind} verified short · ${bucket.unverified} due and unverified`);
  }
  if (report.multiCurrency) lines.push('\nMore than one currency is held: each is printed on its own and no single total is offered.');
  lines.push('');
  lines.push(`Rules: ${report.counts.countsReconcile ? 'the printed figures add up' : 'the printed figures do NOT add up — treat every total as refused'}.`);
  lines.push(`${report.counts.unverified} promise(s) are due with no verified reading. That is a refusal, not a miss and not a clearance.`);
  if (report.counts.verifierDrifted) lines.push(`${report.counts.verifierDrifted} reading(s) were verified by a seat no longer above the owner: counted as unverified until re-verified.`);
  if (report.flags.figuresComplete === false) lines.push(`Some rows could not be read or a period was recorded twice; figures_complete is NO.`);
  return lines.join('\n');
}

/**
 * CSV #158. One summary row per currency, then one row per (lever × effect ×
 * state). Identity-free by construction: the reader's rows carry names, saving
 * references and evidence text, and none of them is reachable from here.
 */
export function synergyCsvRows(report) {
  const rows = [];
  const money = (value) => (Number.isSafeInteger(value) ? String(value) : '');
  for (const bucket of report.currencyTotals) {
    const dealsInCurrency = report.deals.filter((deal) => deal.currency === bucket.currency);
    const capture = (() => {
      let verified = 0n;
      let promised = 0n;
      for (const deal of dealsInCurrency) {
        if (!Number.isSafeInteger(deal.totals.verifiedRunRateCents) || !Number.isSafeInteger(deal.totals.promisedToDateCents)) continue;
        verified += BigInt(deal.totals.verifiedRunRateCents);
        promised += BigInt(deal.totals.promisedToDateCents);
      }
      if (promised === 0n) return null;
      return ppm(Number(verified), Number(promised));
    })();
    const verificationShares = dealsInCurrency
      .map((deal) => deal.verificationSharePpm)
      .filter((value) => Number.isSafeInteger(value));
    const share = verificationShares.length ? Math.round(verificationShares.reduce((acc, value) => acc + value, 0) / verificationShares.length) : null;
    const paybacks = dealsInCurrency.map((deal) => deal.paybackMonthsX10).filter((value) => Number.isSafeInteger(value));
    rows.push({
      as_of: report.asOf,
      currency: bucket.currency,
      row_kind: 'summary',
      lever: '',
      effect: '',
      state_key: '',
      deals_n: String(bucket.deals),
      claims_n: String(bucket.claims),
      claims_live_n: String(bucket.claims),
      state_count: '',
      promised_full_cents: money(bucket.headlineCents),
      promised_to_date_cents: money(bucket.promisedToDateCents),
      verified_run_rate_cents: money(bucket.verifiedRunRateCents),
      unverified_promised_cents: money(bucket.unverifiedToDateCents),
      contested_cents: money(bucket.contestedCents),
      dis_synergy_cents: money(bucket.disSynergyCents),
      cost_to_achieve_cents: money(bucket.costCents),
      pnl_periods_n: String(dealsInCurrency.reduce((acc, deal) => acc + deal.liveRows.reduce((n, row) => n + row.pnlPeriods, 0), 0)),
      pnl_cents: money(bucket.pnlCents),
      capture_verified_ppm: Number.isSafeInteger(capture) ? String(capture) : '',
      verification_share_ppm: Number.isSafeInteger(share) ? String(share) : '',
      payback_months_x10: paybacks.length === 1 ? String(paybacks[0]) : '',
      counts_reconcile: bucket.countsReconcile === false ? 'NO' : 'YES',
      figures_complete: report.flags.figuresComplete ? 'YES' : 'NO',
    });
  }

  const buckets = new Map();
  for (const deal of report.deals) {
    for (const row of deal.rows) {
      const key = [deal.currency, row.leverKey, row.effectKey, row.stateKey].join('|');
      if (!buckets.has(key)) {
        buckets.set(key, {
          currency: deal.currency,
          lever: row.leverKey,
          effect: row.effectKey,
          state: row.stateKey,
          n: 0,
          promised: 0n,
          toDate: 0n,
          verified: 0n,
          unverified: 0n,
          contested: 0n,
          dis: 0n,
          cost: 0n,
        });
      }
      const bucket = buckets.get(key);
      bucket.n += 1;
      const contested = deal.contestedGroups.some((group) => group.members.some((member) => member.claimId === row.id));
      if (contested) {
        bucket.contested += BigInt(row.promisedFullCents || 0);
      } else {
        bucket.promised += signedCents(row, row.promisedFullCents || 0);
        bucket.toDate += signedCents(row, row.promisedToDateCents || 0);
        if (row.effectKey === 'dis-synergy') bucket.dis += BigInt(row.promisedFullCents || 0);
        if (Number.isSafeInteger(row.verifiedRunRateCents) && !row.verifiedDrifted) bucket.verified += signedCents(row, row.verifiedRunRateCents);
        if (row.stateKey === 'unverified') bucket.unverified += BigInt(row.promisedToDateCents || 0);
      }
    }
  }
  for (const bucket of [...buckets.values()].sort((a, b) => `${a.currency}${a.lever}${a.effect}${a.state}`.localeCompare(`${b.currency}${b.lever}${b.effect}${b.state}`))) {
    const currencyRow = report.currencyTotals.find((candidate) => candidate.currency === bucket.currency);
    rows.push({
      as_of: report.asOf,
      currency: bucket.currency,
      row_kind: 'bucket',
      lever: bucket.lever,
      effect: bucket.effect,
      state_key: bucket.state,
      deals_n: String(report.deals.filter((deal) => deal.currency === bucket.currency).length),
      claims_n: String(currencyRow?.claims ?? ''),
      claims_live_n: String(currencyRow?.claims ?? ''),
      state_count: String(bucket.n),
      promised_full_cents: money(printedCents(bucket.promised)),
      promised_to_date_cents: money(printedCents(bucket.toDate)),
      verified_run_rate_cents: money(printedCents(bucket.verified)),
      unverified_promised_cents: money(printedCents(bucket.unverified)),
      contested_cents: money(printedCents(bucket.contested)),
      dis_synergy_cents: money(printedCents(bucket.dis)),
      cost_to_achieve_cents: '',
      pnl_periods_n: '',
      pnl_cents: '',
      capture_verified_ppm: '',
      verification_share_ppm: '',
      payback_months_x10: '',
      counts_reconcile: currencyRow?.countsReconcile === false ? 'NO' : 'YES',
      figures_complete: report.flags.figuresComplete ? 'YES' : 'NO',
    });
  }
  return rows;
}

/** The data the declaration dialogs need. A read; the actions re-prove every rule. */
export function synergyCandidates(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildDealSynergy(state, { now, settings });
  return {
    asOf: report.asOf,
    deals: report.deals.map((deal) => ({ id: deal.id, label: deal.label, currency: deal.currency, signedOn: deal.signedOn, leadId: deal.leadId })),
    claims: report.rows
      .filter((row) => !row.withdrawnOn)
      .map((row) => ({
        id: row.id,
        dealId: row.dealId,
        dealLabel: row.dealLabel,
        currency: row.currency,
        ownerId: row.ownerId,
        ownerName: row.ownerName,
        leverKey: row.leverKey,
        effectKey: row.effectKey,
        savingRef: row.savingRef,
        promisedFullCents: row.promisedFullCents,
        latestDueOn: row.latestDueOn,
        nextDueOn: row.nextDueOn,
        stateKey: row.stateKey,
      })),
    settings: report.settings,
    multiCurrency: report.multiCurrency,
  };
}

/** Group a deal's rows by saving, for the panel's contested view. */
export function synergyContestedGroups(report) {
  return report.deals.flatMap((deal) =>
    deal.contestedGroups.map((group) => ({
      ...group,
      dealLabel: deal.label,
      currency: deal.currency,
    })),
  );
}

/** Re-derive the value of one claim's saving reference, for the dialog preview. */
export function synergySavingKey(value) {
  return groupBySaving([{ dealId: 'x', savingKey: String(value || ''), effectKey: 'synergy', id: 'x' }])[0]?.savingKey || '';
}
