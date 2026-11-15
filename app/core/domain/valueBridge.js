/**
 * app/core/domain/valueBridge.js — the reader of the Enterprise Value Bridge
 * (ADR-0214, Session 287, Schema v168, CSV scope #156).
 *
 * ONE READER, ONE SET OF NUMBERS. The panel, the brief, the badge and the CSV
 * export all call into this module; nothing in the view layer computes a figure.
 * Every printed integer here is the integer the panel renders and the CSV
 * exports, and the two integrity claims (`balances`, `rounding`) are carried
 * beside the figures they qualify instead of being folded into them.
 *
 * SCOPE IS THE ALTITUDE, NOT THE PERSON. Equity value is the owners' claim on
 * the whole company: there is no per-line view of it, because a director's
 * "share" of enterprise value is not a fact the record contains. What the seat
 * granularity buys is the right to READ at all (enterprise class, rank 4+), and
 * the right to DECLARE the readings and the leg owners. A refused read prints
 * its reason.
 *
 * MATRIX RULES, ENFORCED HERE RATHER THAN IN THE SCREEN.
 *   - A leg with two live claims is CONTESTED: both names print, the realised
 *     figure is attributed to neither, and no attainment is computed. The
 *     register never divides a total between two claimants.
 *   - A claim that covers a period no printed bridge covers is counted as
 *     `no-matching-bridge`. Its promise is kept and visible; it is never prorated
 *     into a period it does not name.
 *   - One person claiming twice for one leg and period is a duplicate, refused
 *     by the loader, so a contested leg always means two DIFFERENT people.
 *   - Nothing is read from the reporting graph to guess an owner.
 *
 * Pure module: no DOM, no storage, no clock (every function takes `now`).
 */

import { dayKey, daysBetween } from '../time.js';
import {
  BRIDGE_LEGS,
  BRIDGE_LEG_KEYS,
  attainment,
  computeBridge,
  composeBridges,
  vbMovementText,
  vbMoneyText,
} from './valueBridgeMath.js';
import {
  VALUE_BRIDGE_ADR,
  VALUE_BRIDGE_CSV_SCOPE,
  VALUE_BRIDGE_ENGINE_VERSION,
  VALUE_BRIDGE_LIMITS,
  VALUE_BRIDGE_METHOD,
  VALUE_BRIDGE_PERIMETERS,
  VALUE_BRIDGE_SETTING_KEYS,
  VALUE_BRIDGE_STATES,
} from './valueBridgeRegistry.js';
import {
  claimIsLive,
  normalizeValueBridgeLeverClaims,
  normalizeValueBridgeReadings,
  normalizeValueBridgeSettings,
  readingIsLive,
} from './valueBridgeSchema.js';

const L = VALUE_BRIDGE_LIMITS;
const STATE_BY_KEY = Object.freeze(Object.fromEntries(VALUE_BRIDGE_STATES.map((row) => [row.key, row])));
const LEG_BY_KEY = Object.freeze(Object.fromEntries(BRIDGE_LEGS.map((row) => [row.key, row])));

const rankOf = (seat) => (seat && Number.isInteger(seat.rank) ? seat.rank : 0);

function peopleIndex(state) {
  const map = new Map();
  for (const person of Array.isArray(state?.people) ? state.people : []) {
    if (person && person.id) map.set(person.id, person);
  }
  return map;
}

function nameOf(people, id) {
  const person = people.get(id);
  if (!person) return id;
  return person.name || person.id;
}

function activeOf(people, id) {
  const person = people.get(id);
  return Boolean(person) && person.status !== 'archived';
}

/**
 * The ownership of one leg over one period, from live claims only.
 */
function legOwnership(leg, claims, people, realisedCents, attributable) {
  const matching = claims.filter((claim) => claim.leg === leg && claimIsLive(claim));
  const owners = [];
  for (const claim of matching) {
    owners.push({ id: claim.personId, name: nameOf(people, claim.personId), active: activeOf(people, claim.personId), promisedCents: claim.promisedCents, claimId: claim.id });
  }
  if (!matching.length) {
    return {
      leg,
      state: 'undeclared',
      owners: [],
      promisedCents: null,
      realisedCents: null,
      attainedCents: null,
      note: 'Nobody declared an owner for this leg over this period. The figure carries no name.',
    };
  }
  if (matching.length > 1) {
    return {
      leg,
      state: 'contested',
      owners,
      promisedCents: null,
      realisedCents: null,
      attainedCents: null,
      note: `${owners.length} claims name different people for this leg over the same period. The realised figure is attributed to nobody and no promise is scored: the register does not divide a total between claimants, and the seats above both must settle who answers for it.`,
    };
  }
  const promisedCents = matching[0].promisedCents;
  if (!attributable) {
    return {
      leg,
      state: 'declared',
      owners,
      promisedCents,
      realisedCents: null,
      attainedCents: null,
      note: 'One declared owner. The leg itself is withheld on this bridge, so no attainment is computed against a figure that was refused.',
    };
  }
  const attainedCents = attainment(realisedCents, promisedCents);
  return {
    leg,
    state: 'declared',
    owners,
    promisedCents,
    realisedCents,
    attainedCents,
    note: attainedCents === null
      ? 'One declared owner, but the promise could not be scored against a whole-cent figure.'
      : (attainedCents === 0
        ? 'Delivered exactly what was promised.'
        : (attainedCents > 0
          ? `Delivered ${vbMoneyText(null, attainedCents)} more than was promised.`
          : `Delivered ${vbMoneyText(null, Math.abs(attainedCents))} less than was promised.`)),
  };
}

/** Live readings per currency, sorted by day, with the days that carry two. */
function chainsOf(readings) {
  const byCurrency = new Map();
  for (const reading of readings) {
    if (!readingIsLive(reading)) continue;
    if (!byCurrency.has(reading.currency)) byCurrency.set(reading.currency, []);
    byCurrency.get(reading.currency).push(reading);
  }
  const chains = [];
  for (const [currency, list] of byCurrency) {
    list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0)));
    const counts = new Map();
    for (const reading of list) counts.set(reading.day, (counts.get(reading.day) || 0) + 1);
    const ambiguous = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([day]) => day));
    chains.push({ currency, readings: list, ambiguous });
  }
  chains.sort((a, b) => a.currency.localeCompare(b.currency));
  return chains;
}

/** A reading as the panel and the brief see it — basis included, nothing derived. */
function publicReading(reading) {
  return {
    id: reading.id,
    day: reading.day,
    currency: reading.currency,
    ebitdaCents: reading.ebitdaCents,
    multipleE4: reading.multipleE4,
    netDebtCents: reading.netDebtCents,
    perimeter: reading.perimeter,
    perimeterAdjCents: reading.perimeterAdjCents,
    basis: reading.basis,
    recordedOn: reading.recordedOn,
    recordedById: reading.recordedById,
    supersedesId: reading.supersedesId,
    supersededOn: reading.supersededOn,
    withdrawnOn: reading.withdrawnOn,
    withdrawReason: reading.withdrawReason,
  };
}

/**
 * The whole register for one seat.
 */
export function buildValueBridge(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const today = dayKey(now) || new Date(now).toISOString().slice(0, 10);
  const effective = settings || state.settings || {};
  const conventions = normalizeValueBridgeSettings(effective);
  const warnings = [];
  const readings = normalizeValueBridgeReadings(state.valueBridgeReadings, warnings);
  const claims = normalizeValueBridgeLeverClaims(state.valueBridgeLeverClaims, warnings);
  const people = peopleIndex(state);
  const rank = rankOf(seat);

  const liveClaims = claims.filter(claimIsLive);
  const chains = chainsOf(readings);
  const bridges = [];
  const cumulative = [];
  let code = 0;
  let chainCode = 0;
  let dropped = 0;

  for (const chain of chains) {
    const pairs = [];
    for (let index = 0; index < chain.readings.length - 1; index += 1) {
      const opening = chain.readings[index];
      const closing = chain.readings[index + 1];
      const gapDays = daysBetween(opening.day, closing.day);
      const ageDays = daysBetween(closing.day, today);
      const key = `B${String(++code).padStart(2, '0')}`;

      if (chain.ambiguous.has(opening.day) || chain.ambiguous.has(closing.day)) {
        bridges.push({
          ok: true,
          key,
          kind: 'bridge',
          currency: chain.currency,
          fromDay: opening.day,
          toDay: closing.day,
          gapDays,
          state: 'unreadable',
          stateLabel: STATE_BY_KEY.unreadable.label,
          flags: { stale: false, multipleNotMeaningful: false, netCash: false, perimeterMoved: false },
          readingAgeDays: ageDays,
          opening: publicReading(opening),
          closing: publicReading(closing),
          printed: null,
          exact: null,
          balances: null,
          balancesReason: 'Nothing is printed for a day that carries two live readings.',
          levelClaim: 'none',
          rounding: null,
          levels: null,
          ownership: null,
          withheld: [...BRIDGE_LEG_KEYS],
          withheldReason: 'unreadable',
        });
        pairs.push(null);
        continue;
      }

      const computed = computeBridge(opening, closing);
      if (computed.ok === false) {
        // A kernel refusal is a defect surfaced honestly, never a silent gap.
        warnings.push(`${key}: ${computed.reason}`);
        dropped += 1;
        pairs.push(null);
        bridges.push({
          ok: false,
          key,
          kind: 'bridge',
          currency: chain.currency,
          fromDay: opening.day,
          toDay: closing.day,
          gapDays,
          state: 'unreadable',
          stateLabel: 'Not printed',
          reason: computed.reason,
          flags: { stale: false, multipleNotMeaningful: false, netCash: false, perimeterMoved: false },
          readingAgeDays: ageDays,
          opening: publicReading(opening),
          closing: publicReading(closing),
          printed: null,
          exact: null,
          balances: null,
          balancesReason: computed.reason,
          levelClaim: 'none',
          rounding: null,
          levels: null,
          ownership: null,
          withheld: [...BRIDGE_LEG_KEYS],
          withheldReason: 'kernel-refusal',
        });
        continue;
      }

      const stale = Number.isInteger(ageDays) && ageDays > conventions[VALUE_BRIDGE_SETTING_KEYS.staleDays];
      const flags = { ...computed.flags, stale };
      const attributable = computed.state === 'attributable';
      const ownership = {};
      for (const leg of BRIDGE_LEG_KEYS) {
        const realised = attributable && computed.printed ? computed.printed[`${leg}Cents`] : null;
        ownership[leg] = legOwnership(leg, liveClaims.filter((claim) => claim.fromDay === opening.day && claim.toDay === closing.day), people, realised, attributable && realised !== null);
      }
      const record = {
        ...computed,
        ok: true,
        key,
        kind: 'bridge',
        currency: chain.currency,
        fromDay: opening.day,
        toDay: closing.day,
        gapDays,
        stateLabel: STATE_BY_KEY[computed.state].label,
        flags,
        readingAgeDays: ageDays,
        opening: publicReading(opening),
        closing: publicReading(closing),
        ownership,
      };
      bridges.push(record);
      pairs.push(record);
    }

    // A multi-period chain is printed only when at least three readings make two
    // consecutive attributable bridges; otherwise the pair IS the whole span.
    if (pairs.length >= 2 && pairs.every((bridge) => bridge && bridge.ok && bridge.state === 'attributable')) {
      const composed = composeBridges(pairs);
      if (composed.ok) {
        const chainKey = `C${String(++chainCode).padStart(2, '0')}`;
        const ownership = {};
        for (const leg of BRIDGE_LEG_KEYS) {
          ownership[leg] = legOwnership(
            leg,
            liveClaims.filter((claim) => claim.fromDay === chain.readings[0].day && claim.toDay === chain.readings[chain.readings.length - 1].day),
            people,
            composed.printed[`${leg}Cents`],
            true,
          );
        }
        cumulative.push({
          ...composed,
          key: chainKey,
          kind: 'chain',
          stateLabel: 'Attributed across the whole chain',
          readingAgeDays: daysBetween(chain.readings[chain.readings.length - 1].day, today),
          fromDay: chain.readings[0].day,
          toDay: chain.readings[chain.readings.length - 1].day,
          currency: chain.currency,
          ownership,
        });
      } else {
        warnings.push(`${chain.currency} chain: ${composed.reason}`);
      }
    }
  }

  // Claims whose period no printed bridge matches, kept and counted.
  const bridgePeriods = new Set(bridges.filter((bridge) => bridge.ok).map((bridge) => `${bridge.fromDay}|${bridge.toDay}`));
  const claimsWithoutPeriod = liveClaims
    .filter((claim) => !bridgePeriods.has(`${claim.fromDay}|${claim.toDay}`))
    .map((claim) => ({
      id: claim.id,
      leg: claim.leg,
      personId: claim.personId,
      name: nameOf(people, claim.personId),
      active: activeOf(people, claim.personId),
      fromDay: claim.fromDay,
      toDay: claim.toDay,
      promisedCents: claim.promisedCents,
      basis: claim.basis,
      state: 'no-matching-bridge',
    }));

  // Totals are counts, plus per-currency declared promises. Currencies are never pooled.
  const byCurrency = new Map();
  const bucket = (currency) => {
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, {
        currency,
        readingsN: 0,
        bridgesN: 0,
        attributableN: 0,
        refusedN: 0,
        unreadableN: 0,
        staleN: 0,
        contestedLegsN: 0,
        undeclaredLegsN: 0,
        declaredLegsN: 0,
        promisedCents: 0,
        promisedLegsN: 0,
        attainedCents: 0,
        attainedLegsN: 0,
      });
    }
    return byCurrency.get(currency);
  };
  for (const chain of chains) {
    const total = bucket(chain.currency);
    total.readingsN = chain.readings.length;
  }
  for (const bridge of bridges) {
    const total = bucket(bridge.currency);
    total.bridgesN += 1;
    if (!bridge.ok || bridge.state === 'unreadable') { total.unreadableN += 1; continue; }
    if (bridge.state === 'attributable') total.attributableN += 1;
    else total.refusedN += 1;
    if (bridge.flags.stale) total.staleN += 1;
    for (const leg of BRIDGE_LEG_KEYS) {
      const record = bridge.ownership[leg];
      if (record.state === 'contested') total.contestedLegsN += 1;
      if (record.state === 'undeclared') total.undeclaredLegsN += 1;
      if (record.state === 'declared') {
        total.declaredLegsN += 1;
        if (Number.isSafeInteger(record.promisedCents)) {
          total.promisedCents += record.promisedCents;
          total.promisedLegsN += 1;
        }
        if (Number.isSafeInteger(record.attainedCents)) {
          total.attainedCents += record.attainedCents;
          total.attainedLegsN += 1;
        }
      }
    }
  }
  const currencies = [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));

  const needsAttention = (bridge) => !bridge.ok
    || bridge.state !== 'attributable'
    || Boolean(bridge.flags?.stale)
    || (bridge.ownership ? BRIDGE_LEG_KEYS.some((leg) => bridge.ownership[leg].state === 'contested') : false);

  const totals = {
    attentionN: bridges.filter(needsAttention).length,
    readingsN: chains.reduce((acc, chain) => acc + chain.readings.length, 0),
    liveReadingsN: chains.reduce((acc, chain) => acc + chain.readings.length, 0),
    storedReadingsN: readings.length,
    withdrawnReadingsN: readings.length - chains.reduce((acc, chain) => acc + chain.readings.length, 0),
    claimsN: liveClaims.length,
    withdrawnClaimsN: claims.length - liveClaims.length,
    claimsWithoutPeriodN: claimsWithoutPeriod.length,
    bridgesN: bridges.length,
    attributableN: bridges.filter((bridge) => bridge.ok && bridge.state === 'attributable').length,
    refusedN: bridges.filter((bridge) => bridge.ok && bridge.state === 'perimeter-undeclared').length,
    unreadableN: bridges.filter((bridge) => !bridge.ok || bridge.state === 'unreadable').length,
    staleN: bridges.filter((bridge) => bridge.ok && bridge.flags.stale).length,
    contestedLegsN: bridges.filter((bridge) => bridge.ok).reduce((acc, bridge) => acc + BRIDGE_LEG_KEYS.filter((leg) => bridge.ownership[leg].state === 'contested').length, 0),
    chainRowsN: cumulative.length,
    currenciesN: currencies.length,
    droppedN: dropped,
  };

  const shown = bridges.slice(0, L.bridgesShown);

  return {
    today,
    adr: VALUE_BRIDGE_ADR,
    engineVersion: VALUE_BRIDGE_ENGINE_VERSION,
    csvScope: VALUE_BRIDGE_CSV_SCOPE,
    conventions,
    perimeterConventions: VALUE_BRIDGE_PERIMETERS,
    method: VALUE_BRIDGE_METHOD,
    legs: BRIDGE_LEGS,
    states: VALUE_BRIDGE_STATES,
    seat: {
      rank,
      label: seat?.label || (rank ? `rank ${rank}` : 'undeclared'),
      canRecord: rank >= 4 || Boolean(seat?.fullAccess),
      canClaim: rank >= 4 || Boolean(seat?.fullAccess),
      canGovern: rank >= 5 || Boolean(seat?.fullAccess),
    },
    readings: chains.map((chain) => ({
      currency: chain.currency,
      ambiguousDays: [...chain.ambiguous].sort(),
      rows: chain.readings.map(publicReading),
    })),
    bridges: shown,
    bridgesNotShown: Math.max(0, bridges.length - shown.length),
    chains: cumulative,
    claimsWithoutPeriod,
    currencies,
    totals,
    warnings,
  };
}

/** The badge: bridges whose attribution, ownership or freshness demands a seat. */
export function valueBridgeAttentionCount(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  // Counted over EVERY bridge, not over the twenty-four the panel prints —
  // a badge that only counts the visible page would understate the queue.
  return buildValueBridge(state, { now, settings, seat }).totals.attentionN;
}

const NAME_DISPLAY = (owners) => owners.map((owner) => owner.name).join(' and ');

/**
 * The brief: sentences built from the printed integers only, in the order a
 * chief would say them out loud.
 */
export function valueBridgeBriefText(report) {
  if (!report || !report.bridges.length) {
    return 'No bridge is printed: the register holds fewer than two live readings in one currency. Equity value cannot be said to have moved until it has been read twice.';
  }
  const lines = [];
  for (const bridge of report.bridges) {
    const where = `${bridge.currency} ${bridge.fromDay} → ${bridge.toDay}`;
    if (!bridge.ok || bridge.state === 'unreadable') {
      lines.push(`${where}: not printed — ${bridge.balancesReason || bridge.reason || 'the pair could not be read'}.`);
      continue;
    }
    const movement = vbMovementText(bridge.currency, bridge.printed.closingEquityCents - bridge.printed.openingEquityCents);
    if (bridge.state !== 'attributable') {
      lines.push(`${where}: equity value ${vbMoneyText(bridge.currency, bridge.printed.openingEquityCents)} → ${vbMoneyText(bridge.currency, bridge.printed.closingEquityCents)} (${movement}) with NO attribution — a reading’s perimeter is not separated.`);
      continue;
    }
    const parts = BRIDGE_LEG_KEYS.map((leg) => `${LEG_BY_KEY[leg].label.toLowerCase()} ${vbMovementText(null, bridge.printed[`${leg}Cents`])}`);
    const contested = BRIDGE_LEG_KEYS.filter((leg) => bridge.ownership[leg].state === 'contested');
    const declared = BRIDGE_LEG_KEYS.filter((leg) => bridge.ownership[leg].state === 'declared');
    lines.push(`${where}: equity value ${vbMoneyText(bridge.currency, bridge.printed.openingEquityCents)} → ${vbMoneyText(bridge.currency, bridge.printed.closingEquityCents)} (${movement}) = ${parts.join(' + ')}.`
      + (bridge.balances ? ' The printed cents re-add.' : ' THE PRINTED CENTS DO NOT RE-ADD — a defect, not a reading.')
      + (declared.length ? ` Declared: ${declared.map((leg) => `${LEG_BY_KEY[leg].label} — ${NAME_DISPLAY(bridge.ownership[leg].owners)}`).join('; ')}.` : '')
      + (contested.length ? ` CONTESTED: ${contested.map((leg) => `${LEG_BY_KEY[leg].label} — ${NAME_DISPLAY(bridge.ownership[leg].owners)}`).join('; ')}; no realised figure is attributed to either claim.` : '')
      + (bridge.flags.stale ? ` The closing reading is ${bridge.readingAgeDays} days old and the bridge is stale.` : '')
      + (bridge.flags.multipleNotMeaningful ? ' A multiple on non-positive EBITDA is not a meaningful valuation; the arithmetic is printed and not endorsed.' : ''));
  }
  if (report.chains.length) {
    const chain = report.chains[0];
    lines.push(`Across the whole ${chain.currency} chain (${chain.fromDay} → ${chain.toDay}, ${chain.moments} readings): equity value ${vbMoneyText(chain.currency, chain.printed.openingEquityCents)} → ${vbMoneyText(chain.currency, chain.printed.closingEquityCents)}, with ${BRIDGE_LEG_KEYS.map((leg) => `${LEG_BY_KEY[leg].label.toLowerCase()} ${vbMovementText(null, chain.printed[`${leg}Cents`])}`).join(', ')}.`);
  }
  if (report.currencies.some((row) => row.contestedLegsN > 0)) {
    lines.push('At least one leg is claimed by two people. The register names both and attributes the figure to neither; the seat above both settles it.');
  }
  return lines.join('\n\n');
}

/* ------------------------------------------------------------------- CSV */

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
};

/**
 * Identity-free rows: a bridge or a chain under an opaque positional code, its
 * printed integers and its two integrity claims. Names, ids, bases, reasons,
 * multiples and EBITDA levels never reach the file.
 */
export function valueBridgeCsvRows(report) {
  const rows = [];
  const emit = (record) => {
    const attributable = Boolean(record.printed) && record.state === 'attributable';
    const ownershipCells = {
      legsDeclared: record.ownership ? BRIDGE_LEG_KEYS.filter((leg) => record.ownership[leg].state === 'declared').length : 0,
      legsUndeclared: record.ownership ? BRIDGE_LEG_KEYS.filter((leg) => record.ownership[leg].state === 'undeclared').length : 0,
      legsContested: record.ownership ? BRIDGE_LEG_KEYS.filter((leg) => record.ownership[leg].state === 'contested').length : 0,
    };
    const declared = record.ownership ? BRIDGE_LEG_KEYS.filter((leg) => record.ownership[leg].state === 'declared') : [];
    const promised = declared.length && declared.every((leg) => Number.isSafeInteger(record.ownership[leg].promisedCents))
      ? declared.reduce((acc, leg) => acc + record.ownership[leg].promisedCents, 0)
      : null;
    const attained = declared.length && declared.every((leg) => Number.isSafeInteger(record.ownership[leg].attainedCents))
      ? declared.reduce((acc, leg) => acc + record.ownership[leg].attainedCents, 0)
      : null;
    rows.push({
      row_code: record.key,
      kind: record.kind,
      currency: record.currency,
      from_day: record.fromDay,
      to_day: record.toDay,
      state: record.ok === false ? 'not-printed' : record.state,
      flag_stale: Boolean(record.flags?.stale),
      flag_multiple_not_meaningful: Boolean(record.flags?.multipleNotMeaningful),
      flag_net_cash: Boolean(record.flags?.netCash),
      reading_age_days: record.readingAgeDays ?? null,
      opening_equity_cents: record.printed ? record.printed.openingEquityCents : null,
      operating_cents: attributable ? record.printed.operatingCents : null,
      perimeter_cents: attributable ? record.printed.perimeterCents : null,
      rerating_cents: attributable ? record.printed.reratingCents : null,
      debt_cents: attributable ? record.printed.debtCents : null,
      closing_equity_cents: record.printed ? record.printed.closingEquityCents : null,
      total_movement_cents: record.printed ? record.printed.totalMovementCents : null,
      balances: record.balances === null || record.balances === undefined ? null : record.balances,
      cells_exact: record.rounding ? record.rounding.exactN : null,
      cells_nearest_cent: record.rounding ? record.rounding.nearestN : null,
      cells_moved: record.rounding ? record.rounding.movedN : null,
      max_drift_e3: record.rounding ? record.rounding.maxDriftE3 : null,
      legs_declared: ownershipCells.legsDeclared,
      legs_undeclared: ownershipCells.legsUndeclared,
      legs_contested: ownershipCells.legsContested,
      promised_cents: promised,
      attained_cents: attained,
      withheld_reason: record.withheldReason || null,
    });
  };
  for (const bridge of report.bridges) emit(bridge);
  for (const chain of report.chains) emit(chain);
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, csvCell(value)])));
}
