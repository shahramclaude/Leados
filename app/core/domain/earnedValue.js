/**
 * app/core/domain/earnedValue.js — the read engine of the Earned-Value Delivery
 * & Estimate-at-Completion Register (ADR-0217, Schema v171).
 *
 * Pure. Nothing here writes, stores a state or caches a verdict: every figure,
 * every state, every estimate at completion and every staleness is re-derived
 * from the dated rows on read, against the CURRENT live baseline. A reading that
 * freezes the signature of an older baseline is printed as `baseline-moved` —
 * its figures re-derive against today's plan, and the panel says so.
 *
 * THE TWO FACTS THIS FILE NEVER COLLAPSES.
 *
 *   `reconciles`      — every identity the register prints holds over the rows it
 *                       printed: increments re-add to budgets (enforced at load),
 *                       package EVs re-add to the case EV (true by construction
 *                       and re-checked from the printed integers), allocated plus
 *                       unallocated re-adds to actual cost, and line rows re-add
 *                       to the case (by construction).
 *   `figuresComplete` — every OPEN case has a live baseline, a live reading, and
 *                       the newest reading names a share for EVERY live package
 *                       AND freezes the current baseline signature.
 *
 * They are different facts and are printed apart, exactly as the Bulletproof
 * Reliability Mandate requires.
 *
 * WHAT IT REFUSES (each with a reason printed, never a zero).
 *   - CPI when AC = 0          — "no actual cost recorded at this cut-off"
 *   - SPI when PV = 0          — "no planned value has come due at this cut-off"
 *   - EV / every EAC / TCPI / SV / CPI when any live package lacks a share in
 *     the newest reading — the missing packages are NAMED
 *   - TCPI when BAC − AC ≤ 0   — "the budget is already spent; the index would be fiction"
 *   - per-line attribution for any case whose live packages do not ALL carry a
 *     line split summing to exactly 100 — the case is listed as refused, its
 *     money appears in no line row, and the count is printed
 *   - EAC at CPI when EV = 0   — "no work has been earned yet; the efficiency of none is undefined"
 *   - EAC at CPI×SPI when PV = 0 — same refusal
 *
 * WHAT IT NEVER DOES. It never infers progress from spend, never books an
 * invoice as a completion, never converts or pools a currency, never splits an
 * unattributed package across lines, never re-bases a reading to a newer
 * baseline, never values the programme's benefits, and never rates a person.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import {
  EV_CASE_STATE_BY_KEY,
  EV_ENGINE_VERSION,
  EV_LIMITS,
  EV_METHOD_KEYS,
  evMethodByKey,
} from './earnedValueRegistry.js';
import {
  normalizeEvActuals,
  normalizeEvCases,
  normalizeEvMarkers,
  normalizeEvPackages,
  normalizeEvReadings,
  readEvSettings,
} from './earnedValueSchema.js';
import {
  apportionCents,
  baselineSignature,
  estimatesAtCompletion,
  packageEarnedCents,
  printedCents,
  ppm,
  sumCents,
  tcpiPpm,
} from './earnedValueMath.js';

const L = EV_LIMITS;
const list = (value) => (Array.isArray(value) ? value : []);

const STATE_RANK = {
  withdrawn: 90,
  'package-missing': 10,
  'baseline-moved': 20,
  overrun: 30,
  stale: 40,
  'awaiting-reading': 50,
  unbaselined: 60,
  'on-plan': 70,
};

/** A name for a person this record holds, or a printed stand-in. Never blank. */
function nameOf(personId, peopleById, leaderName) {
  if (!personId) return 'nobody named';
  if (personId === LEADER_ID) return leaderName || 'Workspace leader';
  const person = peopleById.get(personId);
  return person?.name ? String(person.name).replace(/\s+/g, ' ').trim().slice(0, 120) : personId;
}

/** The live baseline of one case: packages not superseded. */
export function liveBaseline(packages, caseId) {
  return packages.filter((pkg) => pkg.caseId === caseId && pkg.status !== 'superseded');
}

/** Increments of one package dated on or before a cut-off, exact. */
export function plannedValueCents(packages, cutoffDay) {
  let total = 0n;
  for (const pkg of packages) {
    for (const phase of pkg.phases) {
      if (phase.phaseEnd <= cutoffDay) total += BigInt(phase.cents);
    }
  }
  return printedCents(total);
}

/** Planned value per package at a cut-off (integer cents each). */
export function plannedValueByPackage(packages, cutoffDay) {
  const map = new Map();
  for (const pkg of packages) {
    let total = 0n;
    for (const phase of pkg.phases) {
      if (phase.phaseEnd <= cutoffDay) total += BigInt(phase.cents);
    }
    map.set(pkg.id, Number(total));
  }
  return map;
}

/** The newest live reading of one case (by decidedOn, then id). */
export function latestLiveReading(readings, caseId) {
  let best = null;
  for (const reading of readings) {
    if (reading.caseId !== caseId || reading.status !== 'live') continue;
    if (!best) { best = reading; continue; }
    if (reading.decidedOn > best.decidedOn) { best = reading; continue; }
    if (reading.decidedOn === best.decidedOn && reading.id > best.id) best = reading;
  }
  return best;
}

/** The declared method of the case, or the default refusing one. */
function methodOf(caseRow) {
  return evMethodByKey(caseRow?.methodKey) || null;
}

/** Exact EV (sum of rounded package EVs) over a set of shares. */
export function earnedValueCents(livePackages, sharesByPackage) {
  let total = 0n;
  const byPackage = new Map();
  for (const pkg of livePackages) {
    const share = sharesByPackage.get(pkg.id);
    if (share === undefined) continue;
    const ev = packageEarnedCents(pkg.plannedCents, share);
    byPackage.set(pkg.id, ev);
    total += BigInt(ev);
  }
  return { totalCents: printedCents(total), byPackage };
}

/** Apportion one package's integer cents across its declared line shares. */
function splitByLine(amountCents, lineShares) {
  const shares = list(lineShares).map((row) => ({ id: row.lineKey, weight: row.pct }));
  return apportionCents(amountCents, shares);
}

/**
 * Build the whole register. Returns every figure the panel, the brief, the
 * attention badge and the CSV print, all derived from the dated rows.
 */
export function buildEarnedValue(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  void seat;
  const warnings = [];
  const asOf = dayKey(now) || '1970-01-01';
  const conv = readEvSettings({ settings: settings || state.settings || {} });
  const peopleById = new Map(
    list(state.people)
      .filter((person) => person && typeof person.id === 'string' && person.status !== 'archived')
      .map((person) => [person.id, person]),
  );
  const leaderName = String(settings?.leaderName ?? state.settings?.leaderName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  const cases = normalizeEvCases(state.earnedValueCases, warnings);
  const packages = normalizeEvPackages(state.earnedValuePackages, cases, warnings);
  const readings = normalizeEvReadings(state.earnedValueReadings, cases, packages, warnings);
  const actuals = normalizeEvActuals(state.earnedValueActuals, cases, packages, warnings);
  normalizeEvMarkers(state.earnedValueMarkers, warnings);

  const liveCases = cases.filter((row) => row.status !== 'withdrawn');
  const withdrawnCases = cases.filter((row) => row.status === 'withdrawn');

  // Grouped lookups.
  const packagesByCase = new Map();
  for (const pkg of packages) {
    const arr = packagesByCase.get(pkg.caseId) || [];
    arr.push(pkg);
    packagesByCase.set(pkg.caseId, arr);
  }
  const readingsByCase = new Map();
  for (const reading of readings) {
    const arr = readingsByCase.get(reading.caseId) || [];
    arr.push(reading);
    readingsByCase.set(reading.caseId, arr);
  }
  const actualsByCase = new Map();
  for (const actual of actuals) {
    const arr = actualsByCase.get(actual.caseId) || [];
    arr.push(actual);
    actualsByCase.set(actual.caseId, arr);
  }

  const rows = [];
  const perCurrency = new Map(); // currency → aggregate accumulator
  const perLine = new Map();     // `${currency} ${lineKey}` → accumulator
  let lineSplitRefused = 0;
  let unallocatedActualRows = 0;
  let figuresComplete = true;
  let reconcilesFailed = false;

  const ensureCurrency = (currency) => {
    if (!perCurrency.has(currency)) {
      perCurrency.set(currency, {
        currency,
        rowKind: 'summary',
        casesOpenN: 0, casesUnbaselinedN: 0, casesAwaitingReadingN: 0,
        casesBaselineMovedN: 0, casesPackageMissingN: 0, casesStaleN: 0,
        casesOverrunN: 0, casesOnPlanN: 0, packagesLiveN: 0, readingsN: 0,
        actualsUnallocatedN: 0, lineSplitRefusedN: 0,
        bacCents: 0n, pvCents: 0n, evCents: 0n, acCents: 0n,
        cvCents: 0n, svCents: 0n,
        eacAtPlanCents: 0n, eacAtCpiCents: 0n, eacAtCpiSpiCents: 0n,
        moneyComplete: true, cpiComplete: true, spiComplete: true,
        atCpiRefusalsN: 0, atCpiSpiRefusalsN: 0,
        countsReconcile: true,
      });
    }
    return perCurrency.get(currency);
  };
  const ensureLine = (currency, lineKey) => {
    const key = `${currency} ${lineKey}`;
    if (!perLine.has(key)) {
      perLine.set(key, {
        currency, lineKey,
        lineLabel: nameOf(lineKey, peopleById, leaderName),
        casesN: 0, bacCents: 0, pvCents: 0, evCents: 0, acCents: 0,
      });
    }
    return perLine.get(key);
  };

  for (const caseRow of liveCases) {
    const casePackages = packagesByCase.get(caseRow.id) || [];
    const live = casePackages.filter((pkg) => pkg.status !== 'superseded');
    const bacCents = printedCents(sumCents(live.map((pkg) => pkg.plannedCents)));
    const currentSignature = baselineSignature(caseRow.id, live);
    const caseActuals = (actualsByCase.get(caseRow.id) || []).filter((row) => row.status === 'live');
    const unallocated = caseActuals.filter((row) => !row.packageId);
    unallocatedActualRows += unallocated.length;
    const ownerOnRoster = caseRow.ownerId === LEADER_ID
      || peopleById.has(caseRow.ownerId);
    const agg = ensureCurrency(caseRow.currency);
    agg.packagesLiveN += live.length;
    agg.actualsUnallocatedN += unallocated.length;

    // Line attribution eligibility: EVERY live package must carry a declared split.
    const fullySplit = live.length > 0 && live.every((pkg) => pkg.lineShares.length > 0);
    const splitRefused = live.length > 0 && !fullySplit;
    if (splitRefused) lineSplitRefused += 1;

    // Baseline BAC rolls up regardless of reading state (it is baseline-derived).
    agg.bacCents += BigInt(bacCents);
    agg.casesOpenN += 1;

    let stateKey = 'unbaselined';
    let latest = null;
    let detail = null;

    if (live.length === 0) {
      agg.casesUnbaselinedN += 1;
      agg.moneyComplete = false;
      figuresComplete = false;
    } else {
      const caseReadings = (readingsByCase.get(caseRow.id) || []).filter((row) => row.status === 'live');
      latest = latestLiveReading(caseReadings, caseRow.id);
      if (!latest) {
        stateKey = 'awaiting-reading';
        agg.casesAwaitingReadingN += 1;
        agg.moneyComplete = false;
        figuresComplete = false;
      } else {
        const sharesByPackage = new Map(latest.shares.map((share) => [share.packageId, share.sharePct]));
        const missing = live.filter((pkg) => !sharesByPackage.has(pkg.id)).map((pkg) => pkg.code);
        const staleShares = latest.shares.filter((share) => !live.some((pkg) => pkg.id === share.packageId)).length;
        const pvByPackage = plannedValueByPackage(live, latest.cutoffDay);
        const pvCents = printedCents([...pvByPackage.values()].reduce((acc, v) => acc + BigInt(v), 0n));
        const cutoffActuals = caseActuals.filter((row) => row.date <= latest.cutoffDay);
        const acAllocated = cutoffActuals.filter((row) => row.packageId);
        const acUnallocated = cutoffActuals.filter((row) => !row.packageId);
        const acCents = printedCents(sumCents(cutoffActuals.map((row) => row.amountCents)));
        const acAllocatedCents = printedCents(sumCents(acAllocated.map((row) => row.amountCents)));
        const acUnallocatedCents = printedCents(sumCents(acUnallocated.map((row) => row.amountCents)));
        const evComplete = missing.length === 0;
        const signatureMatches = latest.baselineSignature === currentSignature;

        let evCents = null, cvCents = null, svCents = null, cpiPpm = null, spiPpm = null, tcpi = null;
        let eacAtPlan = null, eacAtCpi = null, eacAtCpiSpi = null;
        let byPackageEv = new Map();

        if (evComplete) {
          const ev = earnedValueCents(live, sharesByPackage);
          evCents = ev.totalCents;
          byPackageEv = ev.byPackage;
          cvCents = printedCents(BigInt(evCents) - BigInt(acCents));
          svCents = printedCents(BigInt(evCents) - BigInt(pvCents));
          cpiPpm = acCents > 0 ? ppm(evCents, acCents) : null;
          spiPpm = pvCents > 0 ? ppm(evCents, pvCents) : null;
          tcpi = tcpiPpm({ bac: bacCents, ev: evCents, ac: acCents });
          const eac = estimatesAtCompletion({ bac: bacCents, ev: evCents, pv: pvCents, ac: acCents });
          eacAtPlan = eac.atPlan;
          eacAtCpi = eac.atCpi;
          eacAtCpiSpi = eac.atCpiSpi;
          // Identity re-check from printed integers: Σ package EVs === case EV.
          const evReadd = printedCents([...byPackageEv.values()].reduce((acc, v) => acc + BigInt(v), 0n));
          const acReadd = printedCents(BigInt(acAllocatedCents) + BigInt(acUnallocatedCents));
          if (evReadd !== evCents || acReadd !== acCents) reconcilesFailed = true;
        }

        const stale = evDaysBetweenSafe(latest.decidedOn, asOf) > conv.staleDays;
        const readingState = !signatureMatches
          ? 'baseline-moved'
          : missing.length
            ? 'package-missing'
            : 'current';

        if (!signatureMatches) stateKey = 'baseline-moved';
        else if (missing.length) stateKey = 'package-missing';
        else if (cpiPpm !== null && cpiPpm < conv.cpiFloorPpm) stateKey = 'overrun';
        else if (stale) stateKey = 'stale';
        else stateKey = 'on-plan';

        agg.readingsN += 1;
        if (stateKey === 'package-missing') agg.casesPackageMissingN += 1;
        else if (stateKey === 'baseline-moved') agg.casesBaselineMovedN += 1;
        else if (stateKey === 'overrun') agg.casesOverrunN += 1;
        else if (stateKey === 'stale') agg.casesStaleN += 1;
        else agg.casesOnPlanN += 1;

        // Aggregate money is printed only when EVERY case in the currency is complete.
        if (evComplete && signatureMatches) {
          agg.pvCents += BigInt(pvCents);
          agg.evCents += BigInt(evCents);
          agg.acCents += BigInt(acCents);
          agg.cvCents += BigInt(cvCents);
          agg.svCents += BigInt(svCents);
          agg.eacAtPlanCents += BigInt(eacAtPlan);
          if (eacAtCpi === null) agg.atCpiRefusalsN += 1; else agg.eacAtCpiCents += BigInt(eacAtCpi);
          if (eacAtCpiSpi === null) agg.atCpiSpiRefusalsN += 1; else agg.eacAtCpiSpiCents += BigInt(eacAtCpiSpi);
          if (cpiPpm === null) agg.cpiComplete = false;
          if (spiPpm === null) agg.spiComplete = false;
        } else {
          agg.moneyComplete = false;
          figuresComplete = false;
        }

        // Per-line attribution: only fully-split cases contribute.
        if (fullySplit && evComplete && signatureMatches) {
          const lineAcc = new Map(); // lineKey → {bac, pv, ev, ac}
          for (const pkg of live) {
            const pvPkg = pvByPackage.get(pkg.id) || 0;
            const evPkg = byPackageEv.get(pkg.id) || 0;
            const allocatedPkg = printedCents(sumCents(
              cutoffActuals.filter((row) => row.packageId === pkg.id).map((row) => row.amountCents),
            ));
            for (const [measure, amount] of [
              ['bac', pkg.plannedCents], ['pv', pvPkg], ['ev', evPkg], ['ac', allocatedPkg],
            ]) {
              const shares = splitByLine(amount, pkg.lineShares);
              for (const [lineKey, cents] of shares) {
                const acc = lineAcc.get(lineKey) || { bac: 0n, pv: 0n, ev: 0n, ac: 0n };
                acc[measure] += BigInt(cents);
                lineAcc.set(lineKey, acc);
              }
            }
          }
          for (const [lineKey, acc] of lineAcc) {
            const row = ensureLine(caseRow.currency, lineKey);
            row.casesN += 1;
            row.bacCents += printedCents(acc.bac);
            row.pvCents += printedCents(acc.pv);
            row.evCents += printedCents(acc.ev);
            row.acCents += printedCents(acc.ac);
          }
        }

        detail = {
          id: latest.id,
          cutoffDay: latest.cutoffDay,
          decidedOn: latest.decidedOn,
          stateKey: readingState,
          evidenceNote: latest.evidenceNote,
          declaredById: latest.declaredById,
          baselineMoved: !signatureMatches,
          staleShares,
          missingShares: missing,
          stale,
          evCents, pvCents, acCents, acAllocatedCents, acUnallocatedCents,
          cvCents, svCents, cpiPpm, spiPpm, tcpiPpm: tcpi,
          eacAtPlanCents: eacAtPlan, eacAtCpiCents: eacAtCpi, eacAtCpiSpiCents: eacAtCpiSpi,
          evComplete,
          signatureMatches,
        };
      }
    }

    const liveActuals = (actualsByCase.get(caseRow.id) || [])
      .filter((row) => row.status === 'live')
      .map((row) => ({
        id: row.id,
        date: row.date,
        amountCents: row.amountCents,
        packageId: row.packageId,
        unallocated: !row.packageId,
        note: row.note,
        source: row.source,
        declaredById: row.declaredById,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    rows.push({
      id: caseRow.id,
      label: caseRow.label,
      currency: caseRow.currency,
      methodKey: caseRow.methodKey,
      methodLabel: methodOf(caseRow)?.label || caseRow.methodKey,
      ownerId: caseRow.ownerId,
      ownerName: nameOf(caseRow.ownerId, peopleById, leaderName),
      ownerOnRoster,
      status: caseRow.status,
      declaredOn: caseRow.declaredOn,
      baselineVersion: caseRow.baselineVersion,
      livePackageCount: live.length,
      supersededPackageCount: casePackages.length - live.length,
      bacCents,
      acUnallocatedCents: printedCents(sumCents((actualsByCase.get(caseRow.id) || [])
        .filter((row) => row.status === 'live' && !row.packageId && (!latest || row.date <= latest.cutoffDay))
        .map((row) => row.amountCents))),
      latestReading: detail,
      packages: live.map((pkg) => ({ id: pkg.id, code: pkg.code, name: pkg.name, plannedCents: pkg.plannedCents, lineShares: pkg.lineShares, plannedStart: pkg.plannedStart, plannedFinish: pkg.plannedFinish })),
      actuals: liveActuals,
      stateKey,
      stateLabel: EV_CASE_STATE_BY_KEY[stateKey]?.label || stateKey,
      stale: detail?.stale === true,
      cpiFloorBreached: detail?.cpiPpm !== null && detail?.cpiPpm !== undefined && detail.cpiPpm < conv.cpiFloorPpm,
      lineSplit: fullySplit ? 'declared' : splitRefused ? 'refused' : 'none',
      fullySplit,
    });
  }

  for (const caseRow of withdrawnCases) {
    rows.push({
      id: caseRow.id, label: caseRow.label, currency: caseRow.currency,
      methodKey: caseRow.methodKey, methodLabel: methodOf(caseRow)?.label || caseRow.methodKey,
      ownerId: caseRow.ownerId, ownerName: nameOf(caseRow.ownerId, peopleById, leaderName),
      ownerOnRoster: true, status: 'withdrawn', declaredOn: caseRow.declaredOn,
      baselineVersion: caseRow.baselineVersion,
      livePackageCount: 0, supersededPackageCount: 0,
      bacCents: 0, acUnallocatedCents: 0, latestReading: null,
      stateKey: 'withdrawn', stateLabel: EV_CASE_STATE_BY_KEY.withdrawn.label,
      stale: false, cpiFloorBreached: false, lineSplit: 'none', fullySplit: false,
      withdrawnOn: caseRow.withdrawnOn, withdrawnReason: caseRow.withdrawnReason,
      packages: [], actuals: [],
    });
  }

  rows.sort((a, b) => (STATE_RANK[a.stateKey] ?? 80) - (STATE_RANK[b.stateKey] ?? 80)
    || a.label.localeCompare(b.label));

  // Totals: printed only when every money figure in the currency is complete.
  const totals = [...perCurrency.values()].map((agg) => ({
    currency: agg.currency,
    rowKind: 'summary',
    casesOpenN: agg.casesOpenN,
    casesUnbaselinedN: agg.casesUnbaselinedN,
    casesAwaitingReadingN: agg.casesAwaitingReadingN,
    casesBaselineMovedN: agg.casesBaselineMovedN,
    casesPackageMissingN: agg.casesPackageMissingN,
    casesStaleN: agg.casesStaleN,
    casesOverrunN: agg.casesOverrunN,
    casesOnPlanN: agg.casesOnPlanN,
    packagesLiveN: agg.packagesLiveN,
    readingsN: agg.readingsN,
    actualsUnallocatedN: agg.actualsUnallocatedN,
    lineSplitRefusedN: lineSplitRefused,
    bacCents: printedCents(agg.bacCents),
    pvCents: agg.moneyComplete ? printedCents(agg.pvCents) : null,
    evCents: agg.moneyComplete ? printedCents(agg.evCents) : null,
    acCents: agg.moneyComplete ? printedCents(agg.acCents) : null,
    cvCents: agg.moneyComplete ? printedCents(agg.cvCents) : null,
    svCents: agg.moneyComplete ? printedCents(agg.svCents) : null,
    eacAtPlanCents: agg.moneyComplete ? printedCents(agg.eacAtPlanCents) : null,
    eacAtCpiCents: agg.moneyComplete && agg.atCpiRefusalsN === 0 ? printedCents(agg.eacAtCpiCents) : null,
    eacAtCpiSpiCents: agg.moneyComplete && agg.atCpiSpiRefusalsN === 0 ? printedCents(agg.eacAtCpiSpiCents) : null,
    cpiPpm: agg.moneyComplete ? (agg.acCents > 0n ? ppm(Number(agg.evCents), Number(agg.acCents)) : null) : null,
    spiPpm: agg.moneyComplete ? (agg.pvCents > 0n ? ppm(Number(agg.evCents), Number(agg.pvCents)) : null) : null,
    moneyComplete: agg.moneyComplete,
    countsReconcile: !reconcilesFailed,
    figuresComplete,
  }));

  const lineRows = [...perLine.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency) || a.lineKey.localeCompare(b.lineKey));

  const notes = [];
  if (warnings.length) notes.push(`${warnings.length} stored row(s) could not be read exactly and were dropped at load; the register prints the count rather than repairing them.`);

  const counts = {
    casesOpen: liveCases.length,
    casesWithdrawn: withdrawnCases.length,
    casesUnbaselined: rows.filter((r) => r.stateKey === 'unbaselined').length,
    casesAwaitingReading: rows.filter((r) => r.stateKey === 'awaiting-reading').length,
    casesBaselineMoved: rows.filter((r) => r.stateKey === 'baseline-moved').length,
    casesPackageMissing: rows.filter((r) => r.stateKey === 'package-missing').length,
    casesStale: rows.filter((r) => r.stateKey === 'stale').length,
    casesOverrun: rows.filter((r) => r.stateKey === 'overrun').length,
    casesOnPlan: rows.filter((r) => r.stateKey === 'on-plan').length,
    lineSplitRefused,
    actualsUnallocated: unallocatedActualRows,
    readingsLive: readings.filter((row) => row.status === 'live').length,
  };

  return {
    asOf,
    engineVersion: EV_ENGINE_VERSION,
    adr: 'ADR-0217',
    conventions: conv,
    warnings,
    rows,
    totals,
    lines: lineRows,
    counts,
    reconciles: !reconcilesFailed,
    figuresComplete,
    notes,
  };
}

function evDaysBetweenSafe(from, to) {
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** The attention badge: exactly the cases RULE-EVL-01 would ask the owner about today. */
export function earnedValueAttentionCount(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildEarnedValue(state, { now, settings, seat });
  const staleDays = report?.conventions?.staleDays ?? 35;
  let count = 0;
  for (const row of report.rows) {
    if (row.status === 'withdrawn' || !row.ownerOnRoster || row.livePackageCount === 0) continue;
    const basis = row.latestReading?.decidedOn || row.declaredOn;
    const age = evDaysBetweenSafe(basis, report.asOf);
    const owed = age !== null && age > staleDays;
    const overrun = row.cpiFloorBreached && row.latestReading?.evComplete && row.latestReading?.signatureMatches;
    if (owed || overrun) count += 1;
  }
  return count;
}

/** A plain-language brief for the identity-free channel. */
export function earnedValueBriefText(report) {
  const c = report?.counts || {};
  const totals = list(report?.totals);
  const parts = [];
  if ((c.casesOpen ?? 0) === 0) {
    parts.push(`Earned value as of ${report?.asOf || 'unknown'}: no open cases on the record yet.`);
    return parts.join(' ');
  }
  parts.push(`Earned value as of ${report?.asOf || 'unknown'}: ${c.casesOpen ?? 0} open case(s), ${c.casesAwaitingReading ?? 0} awaiting a first reading, ${c.casesPackageMissing ?? 0} with a package unnamed in the newest reading, ${c.casesBaselineMoved ?? 0} whose baseline moved since the newest reading, ${c.casesStale ?? 0} stale, ${c.casesOverrun ?? 0} under the declared cost floor.`);
  for (const total of totals) {
    const money = total.moneyComplete
      ? `BAC ${total.bacCents} cents, EV ${total.evCents}, AC ${total.acCents} (${total.currency}).`
      : `BAC ${total.bacCents} cents; EV/AC withheld — not every case in this currency reads complete against the current baseline.`;
    parts.push(money);
  }
  parts.push(report?.figuresComplete
    ? 'Every open case reads complete against the current baseline.'
    : 'Not every open case reads complete; the withheld cells say so on the panel.');
  return parts.join(' ');
}

/** Aggregate, identity-free CSV rows — one summary row per currency. */
export function earnedValueCsvRows(report) {
  const rows = list(report?.totals);
  return rows.map((total) => ({
    as_of: report.asOf,
    currency: total.currency,
    row_kind: 'summary',
    register_scope_n: total.casesOpenN,
    cases_open_n: total.casesOpenN,
    cases_unbaselined_n: total.casesUnbaselinedN,
    cases_awaiting_reading_n: total.casesAwaitingReadingN,
    cases_baseline_moved_n: total.casesBaselineMovedN,
    cases_package_missing_n: total.casesPackageMissingN,
    cases_stale_n: total.casesStaleN,
    cases_overrun_n: total.casesOverrunN,
    cases_on_plan_n: total.casesOnPlanN,
    packages_live_n: total.packagesLiveN,
    readings_n: total.readingsN,
    actuals_unallocated_n: total.actualsUnallocatedN,
    line_split_refused_n: total.lineSplitRefusedN,
    bac_cents: total.bacCents,
    pv_cents: total.pvCents,
    ev_cents: total.evCents,
    ac_cents: total.acCents,
    cv_cents: total.cvCents,
    sv_cents: total.svCents,
    cpi_ppm: total.cpiPpm,
    spi_ppm: total.spiPpm,
    eac_at_cpi_cents: total.eacAtCpiCents,
    eac_at_plan_cents: total.eacAtPlanCents,
    eac_at_cpi_spi_cents: total.eacAtCpiSpiCents,
    counts_reconcile: report.reconciles ? 1 : 0,
    figures_complete: report.figuresComplete ? 1 : 0,
  }));
}

/** The declaration dialogs' data: everything the door re-proves. */
export function earnedValueCandidates(state = {}, { now = new Date(), settings = null } = {}) {
  const conv = readEvSettings({ settings: settings || state.settings || {} });
  const people = list(state.people)
    .filter((person) => person && person.id && person.status !== 'archived')
    .map((person) => ({ id: person.id, name: person.name || person.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    conventions: conv,
    people,
    methods: EV_METHOD_KEYS.map((key) => ({ key, ...evMethodByKey(key) })),
  };
}
